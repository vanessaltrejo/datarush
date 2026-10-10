"""§4.1: hourly panel station_key x hour, zeros only within each station's activity window."""
import numpy as np
import pandas as pd

import config as C


def build_hourly_panel(trips, qc=None):
    t = trips.copy()
    t["dep_hour"] = t["started_at"].dt.floor("h")
    t["arr_hour"] = t["ended_at"].dt.floor("h")

    # Departures: every clean trip, at its origin station_key.
    dep = (t.groupby(["start_station_key", "dep_hour"])
           .agg(salidas=("ride_id", "size"),
                salidas_member=("member_casual", lambda s: (s == "member").sum()),
                salidas_casual=("member_casual", lambda s: (s == "casual").sum()))
           .reset_index()
           .rename(columns={"start_station_key": "station_key", "dep_hour": "datetime_hour"}))

    # Arrivals: only eligible (filtered to 114 & <=24h), at destination station_key.
    arr = (t[t["is_arrival"]]
           .groupby(["end_station_key", "arr_hour"])
           .size().reset_index(name="llegadas")
           .rename(columns={"end_station_key": "station_key", "arr_hour": "datetime_hour"}))

    # Activity window per station_key = first to last observed trip (origin or dest).
    dep_span = t.groupby("start_station_key")["dep_hour"].agg(["min", "max"])
    arr_span = t[t["is_arrival"]].groupby("end_station_key")["arr_hour"].agg(["min", "max"])
    span = dep_span.join(arr_span, how="outer", lsuffix="_d", rsuffix="_a")
    span["start"] = span[["min_d", "min_a"]].min(axis=1)
    span["end"] = span[["max_d", "max_a"]].max(axis=1)

    # Build the hourly grid inside each window; fill zeros there only.
    grids = []
    for skey, row in span.iterrows():
        rng = pd.date_range(row["start"], row["end"], freq="h")
        grids.append(pd.DataFrame({"station_key": skey, "datetime_hour": rng}))
    grid = pd.concat(grids, ignore_index=True)

    # §2.3 spring-forward: local hour 2 on 2026-03-08 does not exist. Drop false-zero cell.
    drop_date, drop_hour = C.DST_DROP
    bad = (grid["datetime_hour"].dt.strftime("%Y-%m-%d") == drop_date) & (grid["datetime_hour"].dt.hour == drop_hour)
    if qc:
        qc.info(f"DST spring-forward cells dropped (2026-03-08 h2): {int(bad.sum())}")
    grid = grid[~bad]

    panel = (grid.merge(dep, on=["station_key", "datetime_hour"], how="left")
                 .merge(arr, on=["station_key", "datetime_hour"], how="left"))
    for col in ["salidas", "salidas_member", "salidas_casual", "llegadas"]:
        panel[col] = panel[col].fillna(0).astype(int)
    panel["flujo_neto"] = panel["llegadas"] - panel["salidas"]
    panel["hour"] = panel["datetime_hour"].dt.hour
    panel["date"] = panel["datetime_hour"].dt.normalize()

    if qc:
        zero = (panel["salidas"] == 0).mean()  # §2.2 target ~59.3%
        qc.info(f"hourly panel rows={len(panel):,} | zero cells (salidas==0)={100*zero:.1f}%")
    return panel


if __name__ == "__main__":
    from load_clean import load_and_clean
    trips, stations, qc = load_and_clean(qc=None)
    from load_clean import QCLog
    qc = QCLog()
    panel = build_hourly_panel(trips, qc)
    print(panel.head().to_string())
