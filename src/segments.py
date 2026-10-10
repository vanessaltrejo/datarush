"""§5.5: KMeans segments over the normalized 24h departure profile of each station."""
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans

import config as C


def build_profiles(hourly_panel):
    """avg departures/arrivals/net by hour x day_of_week per station_key (for profiles.csv)."""
    hp = hourly_panel.copy()
    hp["day_of_week"] = hp["datetime_hour"].dt.dayofweek
    prof = (hp.groupby(["station_key", "hour", "day_of_week"])
            .agg(avg_departures=("salidas", "mean"),
                 avg_arrivals=("llegadas", "mean"),
                 avg_net=("flujo_neto", "mean"))
            .reset_index())
    return prof


def _profile_matrix(hourly_panel):
    """24-dim normalized departure shape per station_key."""
    m = (hourly_panel.groupby(["station_key", "hour"])["salidas"].mean()
         .unstack("hour").reindex(columns=range(24)).fillna(0.0))
    norm = m.div(m.sum(axis=1).replace(0, np.nan), axis=0).fillna(0.0)
    return norm


def segment_stations(hourly_panel, qc=None):
    norm = _profile_matrix(hourly_panel)
    km = KMeans(n_clusters=C.KMEANS_K, random_state=C.RANDOM_SEED, n_init=10)
    labels = km.fit_predict(norm.to_numpy())
    seg = pd.DataFrame({"station_key": norm.index, "segment_id": labels})

    # Name clusters by peak-hour of the mean profile (data-driven, §5.5).
    names, actions = {}, {}
    for cid in range(C.KMEANS_K):
        centroid = norm.to_numpy()[labels == cid].mean(axis=0)
        peak = int(np.argmax(centroid))
        am = centroid[6:12].sum()
        pm = centroid[14:20].sum()
        if peak < 12:
            names[cid] = f"Morning-peak (h{peak})"
            actions[cid] = "Fill before AM; expect drain by late morning"
        elif peak < 20:
            names[cid] = f"Evening-peak (h{peak})"
            actions[cid] = "Fill before PM; expect drain by evening"
        else:
            names[cid] = f"Night/flat (h{peak})"
            actions[cid] = "Low priority; monitor"
    seg["segment"] = seg["segment_id"].map(names)
    seg["segment_action"] = seg["segment_id"].map(actions)

    if qc:
        # §5.5 reference floor: median inter-station profile correlation.
        corr = np.corrcoef(norm.to_numpy())
        iu = np.triu_indices_from(corr, k=1)
        qc.info(f"inter-station profile corr median={np.median(corr[iu]):.3f} "
                f"(floor ref {C.PROFILE_CORR_FLOOR}); segment sizes={seg.segment.value_counts().to_dict()}")
    return seg[["station_key", "segment", "segment_action"]]
