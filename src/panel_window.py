"""§4.2: window panel (station_key x date x window) with the `necesidad` target + features."""
import holidays
import numpy as np
import pandas as pd

import config as C


def _window_rows(panel, name, hours):
    lo, hi = hours
    sub = panel[(panel["hour"] >= lo) & (panel["hour"] <= hi)].copy()
    sub = sub.sort_values(["station_key", "date", "hour"])
    # §0: peak cumulative deficit within the window, in hour order.
    sub["cumnet"] = sub.groupby(["station_key", "date"])["flujo_neto"].cumsum()
    agg = (sub.groupby(["station_key", "date"])
           .agg(min_cum=("cumnet", "min"),
                salidas=("salidas", "sum"),
                llegadas=("llegadas", "sum"))
           .reset_index())
    agg["necesidad"] = (-agg["min_cum"]).clip(lower=0)
    agg["ventana"] = name
    return agg.drop(columns="min_cum")


def build_window_panel(panel, qc=None):
    parts = [_window_rows(panel, name, hrs) for name, hrs in C.WINDOWS.items()]
    wp = pd.concat(parts, ignore_index=True)

    wp["date"] = pd.to_datetime(wp["date"])
    wp["dia_semana"] = wp["date"].dt.dayofweek
    wp["es_fin_de_semana"] = wp["dia_semana"] >= 5
    us_hol = holidays.US(years=[2025, 2026])
    wp["es_festivo"] = wp["date"].dt.date.map(lambda d: d in us_hol)

    # Lags within (station_key, ventana, dia_semana): consecutive rows are 7 days apart.
    wp = wp.sort_values(["station_key", "ventana", "dia_semana", "date"])
    g = wp.groupby(["station_key", "ventana", "dia_semana"], observed=True)
    wp["necesidad_hace_7d"] = g["necesidad"].shift(1)                       # same weekday, 1 week back
    wp["necesidad_media_4sem"] = g["necesidad"].shift(1).rolling(4, min_periods=1).mean()
    wp["salidas_media_4sem"] = g["salidas"].shift(1).rolling(4, min_periods=1).mean()

    # Keep only windows with real activity (§0: ~67,488 station-day-window cases).
    # Lags above are computed on the full grid so a quiet prior week reads as necesidad=0.
    wp = wp[(wp["salidas"] + wp["llegadas"]) > 0].copy()
    wp = wp.sort_values(["station_key", "date", "ventana"]).reset_index(drop=True)
    if qc:
        qc.info(f"window panel rows={len(wp):,} | necesidad>0 in {100*(wp.necesidad>0).mean():.1f}% of rows")
    return wp


if __name__ == "__main__":
    from load_clean import load_and_clean, QCLog
    from panel_hourly import build_hourly_panel
    trips, stations, _ = load_and_clean(qc=None)
    qc = QCLog()
    hp = build_hourly_panel(trips, None)
    wp = build_window_panel(hp, qc)
    # Sanity vs §6: Grove St PATH PM, Hamilton Park AM quantiles (summer 2026).
    summer = wp[wp["date"] >= "2026-06-01"].merge(stations[["station_key", "name"]], on="station_key")
    for nm, win in [("Grove St PATH", "PM"), ("River St & Newark St", "PM"),
                    ("Hamilton Park", "AM"), ("Brunswick St", "AM")]:
        s = summer[(summer["name"] == nm) & (summer["ventana"] == win)]["necesidad"]
        if len(s):
            print(f"{nm:28s} {win}  p50={s.quantile(.5):.0f}  p90={s.quantile(.9):.0f}  max={s.max():.0f}  n={len(s)}")
