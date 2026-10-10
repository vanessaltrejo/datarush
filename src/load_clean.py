"""§1-2: load the 12 CSVs, clean with verified counts, build station_key + stations table."""
import sys
import pandas as pd

import config as C

RAW_COLS = [
    "ride_id", "rideable_type", "started_at", "ended_at",
    "start_station_name", "start_station_id", "end_station_name", "end_station_id",
    "start_lat", "start_lng", "end_lat", "end_lng", "member_casual",
]


class QCLog:
    def __init__(self):
        self.lines = []

    def record(self, key, count, note=""):
        expected = C.EXPECTED_COUNTS.get(key)
        line = f"[{key}] rows={count}" + (f" expected={expected}" if expected is not None else "")
        if note:
            line += f" | {note}"
        self.lines.append(line)
        print(line)
        if expected is not None and count != expected:
            raise AssertionError(
                f"QC mismatch on {key}: got {count}, expected {expected}. "
                f"Something broke — stop and investigate (see PLAN_ML.md)."
            )

    def info(self, msg):
        self.lines.append(f"[info] {msg}")
        print(f"[info] {msg}")


def _load_raw():
    files = sorted(C.DATA_DIR.glob(C.CSV_GLOB))  # chronological by YYYYMM filename
    if len(files) != 12:
        raise RuntimeError(f"expected 12 CSVs, found {len(files)}: {[f.name for f in files]}")
    frames = []
    dtypes = {c: "string" for c in C.ID_COLS}
    dtypes.update({"ride_id": "string", "start_station_name": "string",
                   "end_station_name": "string", "member_casual": "string",
                   "rideable_type": "string"})
    for f in files:
        df = pd.read_csv(f, dtype=dtypes)
        df["__src"] = f.name
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    for col in ("started_at", "ended_at"):
        df[col] = pd.to_datetime(df[col], format="ISO8601", errors="coerce")
    for col in ("start_lat", "start_lng", "end_lat", "end_lng"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _blank(s):
    """True where a string column is null or empty."""
    return s.isna() | (s.str.strip() == "")


def load_and_clean(qc=None):
    qc = qc or QCLog()
    df = _load_raw()
    qc.info(f"loaded {len(df):,} raw rows from 12 files")

    # Rule 1: drop rows with no start_station_id (also missing coords).
    mask = _blank(df["start_station_id"])
    qc.record("rule1_no_start_id", int(mask.sum()))
    df = df[~mask].copy()

    # Rule 2: exact duplicate ride_id, keep first (chronological). 18 extras.
    dup = df.duplicated(subset="ride_id", keep="first")
    qc.record("rule2_dup_ride_id", int(dup.sum()), note="Apr-30 rows in both Apr and May files")
    df = df[~dup].copy()

    # Rule 3: non-positive duration (ended <= started). All negative.
    bad = df["ended_at"] <= df["started_at"]
    qc.record("rule3_bad_duration", int(bad.sum()))
    df = df[~bad].copy()

    # Rule 4: recover end_station_id by name (name present, id missing).
    name_to_id = _build_name_to_id(df)
    missing_end = _blank(df["end_station_id"])
    recoverable = missing_end & df["end_station_name"].map(
        lambda n: isinstance(n, str) and n in name_to_id
    )
    df.loc[recoverable, "end_station_id"] = df.loc[recoverable, "end_station_name"].map(name_to_id)
    qc.record("rule4_recovered_end_id", int(recoverable.sum()))

    # Rule 5: trips still without a destination id — KEPT (count as departure only).
    no_dest = _blank(df["end_station_id"])
    qc.record("rule5_no_dest", int(no_dest.sum()), note="kept as departures, excluded from arrivals")

    # The 114 origin stations (distinct cleaned start ids).
    station_114 = set(df["start_station_id"].dropna().unique())
    qc.info(f"distinct start stations: {len(station_114)}")
    if len(station_114) != C.N_START_STATIONS:
        raise AssertionError(f"expected {C.N_START_STATIONS} start stations, got {len(station_114)}")

    # trip duration in hours (for arrival rule 6).
    df["dur_h"] = (df["ended_at"] - df["started_at"]).dt.total_seconds() / 3600.0

    # Arrival-side filters (do NOT drop rows; mark eligibility for arrivals).
    has_dest = ~no_dest
    # Rule 6 count is reported over all trips >24h (spec §2); effect applies to arrivals.
    long_trip = df["dur_h"] > C.MAX_TRIP_HOURS
    qc.record("rule6_arrival_over_24h", int(long_trip.sum()), note=f"max {df['dur_h'].max():.1f} h")
    over_24 = has_dest & long_trip

    outside = has_dest & (~df["end_station_id"].isin(station_114))
    qc.record("rule7_arrival_outside_114", int(outside.sum()), note="destinations only in Manhattan")

    df["is_arrival"] = has_dest & ~over_24 & ~outside

    # §2.1 station_key unification.
    df["start_station_key"] = df["start_station_id"].map(lambda x: C.RELOCATIONS.get(x, x))
    df["end_station_key"] = df["end_station_id"].map(
        lambda x: C.RELOCATIONS.get(x, x) if isinstance(x, str) else x
    )

    circular = (df["start_station_id"] == df["end_station_id"]).sum()
    qc.info(f"circular trips kept (origin=dest): {circular:,} ({100*circular/len(df):.2f}%)")

    stations = _build_stations(df, station_114, qc)
    qc.info(f"station_keys after unification: {stations['station_key'].nunique()}")
    return df, stations, qc


def _build_name_to_id(df):
    """Most frequent station_id per station_name, across both start and end sides."""
    pairs = []
    s = df[["start_station_name", "start_station_id"]].rename(
        columns={"start_station_name": "name", "start_station_id": "id"})
    e = df[["end_station_name", "end_station_id"]].rename(
        columns={"end_station_name": "name", "end_station_id": "id"})
    both = pd.concat([s, e], ignore_index=True)
    both = both[~_blank(both["name"]) & ~_blank(both["id"])]
    counts = both.groupby(["name", "id"]).size().reset_index(name="n")
    counts = counts.sort_values("n", ascending=False).drop_duplicates("name")
    return dict(zip(counts["name"], counts["id"]))


def _build_stations(df, station_114, qc):
    """One row per station_key: canonical id, name, coords, member ids. §2 JC118 dual name."""
    # id -> most frequent name (handles JC118 dual name automatically).
    idname = pd.concat([
        df[["start_station_id", "start_station_name"]].rename(
            columns={"start_station_id": "id", "start_station_name": "name"}),
        df[["end_station_id", "end_station_name"]].rename(
            columns={"end_station_id": "id", "end_station_name": "name"}),
    ], ignore_index=True)
    idname = idname[~_blank(idname["id"]) & ~_blank(idname["name"])]
    name_by_id = (idname.groupby(["id", "name"]).size().reset_index(name="n")
                  .sort_values("n", ascending=False).drop_duplicates("id")
                  .set_index("id")["name"].to_dict())

    # coords: first observed start coords per id (stable, §1.1).
    coords = (df.dropna(subset=["start_lat", "start_lng"])
              .groupby("start_station_id")[["start_lat", "start_lng"]].first())

    rows = []
    for key in sorted(station_114, key=lambda k: C.RELOCATIONS.get(k, k)):
        skey = C.RELOCATIONS.get(key, key)
        rows.append({"orig_id": key, "station_key": skey})
    skeys = sorted({C.RELOCATIONS.get(k, k) for k in station_114})

    out = []
    reloc_targets = set(C.RELOCATIONS.values())
    for skey in skeys:
        ids = [k for k in station_114 if C.RELOCATIONS.get(k, k) == skey]
        # canonical/current id = the relocation target if present, else the key itself.
        current = skey if skey in coords.index else ids[0]
        lat = coords.loc[current, "start_lat"] if current in coords.index else None
        lng = coords.loc[current, "start_lng"] if current in coords.index else None
        out.append({
            "station_key": skey,
            "station_ids": "|".join(sorted(ids)),
            "name": name_by_id.get(current, name_by_id.get(ids[0], skey)),
            "lat": lat, "lng": lng,
            "is_relocation": skey in reloc_targets,
        })
    return pd.DataFrame(out)


if __name__ == "__main__":
    sys.path.insert(0, str(C.ROOT / "src"))
    trips, stations, qc = load_and_clean()
    print(f"\nclean trips: {len(trips):,} | arrivals eligible: {trips['is_arrival'].sum():,}")
    print(stations.head(10).to_string())
