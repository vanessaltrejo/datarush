"""§7.4: preloaded forecast for future dates (10-17 Oct) using frozen lags + forecast weather."""
import holidays
import numpy as np
import pandas as pd

import config as C
from model_lgbm import predict_lgbm
from weather import fetch_forecast_weather


def _active_stations_at(window_panel, cutoff="2026-09-24"):
    """station_keys with activity in the final stretch (proxy for 'active at 2026-09-30')."""
    recent = window_panel[window_panel["date"] >= cutoff]
    return set(recent["station_key"].unique())


def build_forecast_grid(window_panel, qc=None):
    active = _active_stations_at(window_panel)
    dates = pd.date_range(C.FORECAST_START, C.FORECAST_END, freq="D")
    rows = []
    for sk in sorted(active):
        for d in dates:
            for win in C.WINDOWS:
                rows.append({"station_key": sk, "date": d, "ventana": win})
    grid = pd.DataFrame(rows)
    grid["dia_semana"] = grid["date"].dt.dayofweek
    grid["es_fin_de_semana"] = grid["dia_semana"] >= 5
    us_hol = holidays.US(years=[2026])
    grid["es_festivo"] = grid["date"].dt.date.map(lambda x: x in us_hol)

    # Frozen lags: mean over last 4 weeks available (September) by station/ventana/weekday.
    sep = window_panel[(window_panel["date"] >= "2026-09-01") & (window_panel["date"] <= "2026-09-30")]
    lag = (sep.groupby(["station_key", "ventana", "dia_semana"])
           .agg(necesidad_media_4sem=("necesidad", "mean"),
                salidas_media_4sem=("salidas", "mean")).reset_index())
    grid = grid.merge(lag, on=["station_key", "ventana", "dia_semana"], how="left")
    # necesidad_hace_7d does not exist for the future -> use the 4-week mean (documented §7.4).
    grid["necesidad_hace_7d"] = grid["necesidad_media_4sem"]
    grid = grid.dropna(subset=["necesidad_media_4sem"])
    if qc:
        qc.info(f"forecast grid rows={len(grid)} stations={grid.station_key.nunique()} dates={len(dates)}")
    return grid


def run_forecast(models, window_panel, use_weather, qc=None):
    grid = build_forecast_grid(window_panel, qc)
    if use_weather:
        try:
            wx = fetch_forecast_weather(C.FORECAST_START, C.FORECAST_END)
            grid = grid.merge(wx, on=["date", "ventana"], how="left")
        except Exception as e:  # forecast endpoint may be unavailable; fall back
            if qc:
                qc.info(f"forecast weather unavailable ({e}); filling neutral values")
            use_weather = False
    if not use_weather:
        grid["temp_media"], grid["precip_total"] = 15.0, 0.0
        grid["hubo_lluvia"], grid["viento_max"] = False, 10.0

    preds = predict_lgbm(models, grid)
    out = preds.merge(grid[["station_key", "date", "ventana", "salidas_media_4sem",
                            "hubo_lluvia"]], on=["station_key", "date", "ventana"])
    out["mode"] = "forecast"
    out["need_actual"] = np.nan
    out["covered"] = np.nan
    out["baseline_p50"] = np.nan
    out["baseline_p90"] = np.nan
    out["departures_pred"] = out["salidas_media_4sem"].round(1)
    out["rain"] = out["hubo_lluvia"].astype(int)
    return out.drop(columns=["salidas_media_4sem", "hubo_lluvia"])
