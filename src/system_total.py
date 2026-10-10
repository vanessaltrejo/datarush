"""System-wide recommendation. Summing every station's p90 assumes all stations have their bad
day at once, which never happens, so that sum overshoots the real system need (~1.9x in Jul-Sep).
Instead: system total = sum of station p50 x a factor. The factor is the SYSTEM_COVERAGE quantile
of (real total / sum of p50) over the SYSTEM_LOOKBACK_DAYS before the scored month, per window,
so it never sees the day it scores."""
import numpy as np
import pandas as pd

import config as C


def _daily_ratios(preds):
    d = (preds.groupby(["date", "ventana"])
         .agg(sum_p50=("need_p50", "sum"), actual=("necesidad", "sum"))
         .reset_index())
    d["ratio"] = d["actual"] / d["sum_p50"].where(d["sum_p50"] > 0)
    return d


def _past_factor(daily, before, window, lookback_days):
    past = daily[(daily["date"] < before) & (daily["ventana"] == window)]
    if lookback_days is not None:
        past = past[past["date"] >= pd.Timestamp(before) - pd.Timedelta(days=lookback_days)]
    return past["ratio"].dropna().quantile(C.SYSTEM_COVERAGE)


def _scored(daily, lookback_days):
    rows = []
    for fold in C.DISPLAY_FOLDS:
        month = daily[(daily["date"] >= fold["test_start"]) & (daily["date"] <= fold["test_end"])]
        for win, sub in month.groupby("ventana"):
            rows.append(sub.assign(mode="backtest", factor=_past_factor(daily, fold["test_start"], win, lookback_days)))
    return pd.concat(rows, ignore_index=True)


def system_totals(backtest_preds, forecast_preds, qc=None):
    """One row per date x window: sum of p50, the factor, the system p90 and (backtest) the real total."""
    daily = _daily_ratios(backtest_preds)
    if qc:
        for lookback in (None, 84, 56, 28):
            s = _scored(daily, lookback)
            total = s["sum_p50"] * s["factor"]
            qc.info(f"system total lookback={lookback or 'all'}: coverage={100*(s['actual'] <= total).mean():.1f}% "
                    f"| total/actual={(total / s['actual']).mean():.2f}")
    out = _scored(daily, C.SYSTEM_LOOKBACK_DAYS)

    if forecast_preds is not None and len(forecast_preds):
        f = (forecast_preds.groupby(["date", "ventana"]).agg(sum_p50=("need_p50", "sum")).reset_index())
        after_last = pd.Timestamp(C.FOLDS[-1]["test_end"]) + pd.Timedelta(days=1)
        f["factor"] = f["ventana"].map(
            lambda win: _past_factor(daily, after_last, win, C.SYSTEM_LOOKBACK_DAYS))
        f["actual"] = np.nan
        f["mode"] = "forecast"
        out = pd.concat([out, f], ignore_index=True)

    out["system_p90"] = (out["sum_p50"] * out["factor"]).round(0)
    bt = out[out["mode"] == "backtest"]
    if qc:
        cov = (bt["actual"] <= bt["system_p90"]).mean()
        qc.info(f"system total: coverage on display months={100*cov:.1f}% "
                f"| system_p90/actual={(bt['system_p90'] / bt['actual']).mean():.2f} "
                f"| factors {out.groupby(['mode', 'ventana'])['factor'].mean().round(2).to_dict()}")
    out = out.rename(columns={"ventana": "window"})
    out["sum_p50"] = out["sum_p50"].round(1)
    out["factor"] = out["factor"].round(3)
    return out[["date", "window", "mode", "sum_p50", "factor", "system_p90", "actual"]]
