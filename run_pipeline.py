"""Orchestrates the Citi Bike pipeline in PLAN_ML.md §8 order. Core first, extras after."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import pandas as pd

import config as C
from load_clean import load_and_clean, QCLog
from panel_hourly import build_hourly_panel
from panel_window import build_window_panel
from weather import join_window_weather
from validate import run_validation
from model_lgbm import train_lgbm
from forecast_mode import run_forecast
from hourly_model import predict_hourly
from segments import segment_stations, build_profiles
import export


def _check(qc, label, value, expected, tol):
    ok = abs(value - expected) <= tol
    qc.info(f"SANITY {label}: got {value:.1f} expected~{expected} (±{tol}) -> {'OK' if ok else 'CHECK'}")


def main():
    qc = QCLog()

    # --- Core (§8 steps 1-3) ---
    trips, stations, _ = load_and_clean(qc)
    keys = sorted(stations["station_key"].unique())
    hourly = build_hourly_panel(trips, qc)
    window = build_window_panel(hourly, qc)
    window = join_window_weather(window, qc)

    # --- Validation: baseline + lightgbm, no-weather and with-weather (§8 steps 4-6, 8) ---
    m_core, preds_core = run_validation(window, keys, use_weather=False, qc=qc)
    m_wx, preds_wx = run_validation(window, keys, use_weather=True, qc=qc)
    metrics = pd.concat([m_core, m_wx[m_wx["model"].str.contains("weather")]], ignore_index=True)

    # Primary model = LightGBM with weather (user choice). Comparison still logged below.
    def mean_bikes(m, name):
        r = m[(m["model"] == name) & (m["window"] == "all")]
        return r["total_bikes"].mean(), r["coverage"].mean()
    b_core, c_core = mean_bikes(m_core, "lightgbm")
    b_wx, c_wx = mean_bikes(m_wx, "lightgbm_weather")
    use_weather = True
    primary_preds = preds_wx if use_weather else preds_core
    qc.info(f"primary model: {'lightgbm_weather' if use_weather else 'lightgbm'} (forced) "
            f"(bikes core={b_core:.0f}@{100*c_core:.0f}% vs wx={b_wx:.0f}@{100*c_wx:.0f}%)")

    # --- Forecast mode (§8 step 11): train on all validated months (train<=Sep 30, §7.4) ---
    fc_preds = None
    try:
        fc_train = window[window["date"] <= C.FORECAST_TRAIN_END].dropna(subset=["necesidad_media_4sem"])
        fc_model = train_lgbm(fc_train, use_weather, keys, qc)
        fc_preds = run_forecast(fc_model, window, use_weather, qc)
    except Exception as e:
        qc.info(f"forecast mode skipped: {e}")

    # --- Extras (§8 steps 9, 10, 12) ---
    segments_df = segment_stations(hourly, qc)
    profiles_df = build_profiles(hourly)
    routes_df = export.routes_table(trips)
    weather_fx = export.weather_effect_table(window)
    hourly_preds = predict_hourly(hourly, qc)

    # --- Assemble output contract (§7) ---
    station_tbl = export.station_table(stations, hourly, primary_preds, segments_df)
    pw_tbl = export.predictions_window_table(primary_preds, fc_preds)
    tables = {
        "stations": station_tbl,
        "predictions_window": pw_tbl,
        "metrics": metrics,
        "profiles": profiles_df,
        "routes": routes_df,
        "weather_effect": weather_fx,
    }
    export.write_all(tables, hourly_preds, qc)

    # --- Sanity checks vs §6 verified numbers ---
    summer = window[window["date"] >= "2026-06-01"].merge(stations[["station_key", "name"]], on="station_key")
    grove = summer[(summer["name"] == "Grove St PATH") & (summer["ventana"] == "PM")]["necesidad"]
    if len(grove):
        _check(qc, "Grove St PATH PM p90", grove.quantile(0.9), 97, 3)
    oak = hourly.merge(stations[["station_key", "name"]], on="station_key")
    oak = oak[oak["name"].str.contains("Oakland", na=False)]
    if len(oak):
        _check(qc, "Oakland Ave annual net imbalance", oak["flujo_neto"].sum(), -1807, 150)
    cov = metrics[(metrics["window"] == "all") & metrics["model"].str.startswith("lightgbm")]["coverage"].mean()
    _check(qc, "mean lightgbm coverage", 100 * cov, 90, 4)

    (C.OUTPUT_DIR / "qc_log.txt").write_text("\n".join(qc.lines), encoding="utf-8")
    print(f"\nDONE. Outputs in {C.OUTPUT_DIR}")


if __name__ == "__main__":
    main()
