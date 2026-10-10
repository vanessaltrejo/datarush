"""§12 (optional): hourly departures detail for the station click-through view.

Empirical profile predictor by (station_key, hour, day_type), fit per fold on train only.
Produces predictions_hourly for the Aug+Sep test windows with p10/p90 bounds.
"""
import numpy as np
import pandas as pd

import config as C


def _profiles(train):
    train = train.copy()
    train["day_type"] = np.where(train["datetime_hour"].dt.dayofweek >= 5, "weekend", "weekday")
    g = train.groupby(["station_key", "hour", "day_type"])
    prof = g.agg(
        departures_pred=("salidas", "mean"),
        departures_lo=("salidas", lambda s: s.quantile(0.1)),
        departures_hi=("salidas", lambda s: s.quantile(0.9)),
        net_flow_pred=("flujo_neto", "mean"),
    ).reset_index()
    return prof


def predict_hourly(hourly_panel, qc=None):
    hp = hourly_panel.copy()
    out = []
    for fold in C.FOLDS:
        train = hp[hp["date"] <= fold["train_end"]]
        test = hp[(hp["date"] >= fold["test_start"]) & (hp["date"] <= fold["test_end"])].copy()
        test = test[~test["station_key"].isin(C.EVAL_EXCLUDE)]
        test["day_type"] = np.where(test["datetime_hour"].dt.dayofweek >= 5, "weekend", "weekday")
        prof = _profiles(train)
        m = test.merge(prof, on=["station_key", "hour", "day_type"], how="left")
        m = m.rename(columns={"salidas": "departures_actual", "flujo_neto": "net_flow_actual"})
        out.append(m[["station_key", "datetime_hour", "departures_actual", "departures_pred",
                      "departures_lo", "departures_hi", "net_flow_actual", "net_flow_pred"]])
    res = pd.concat(out, ignore_index=True)
    for c in ["departures_pred", "departures_lo", "departures_hi", "net_flow_pred"]:
        res[c] = res[c].round(2)
    if qc:
        qc.info(f"predictions_hourly rows={len(res):,}")
    return res
