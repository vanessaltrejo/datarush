"""Verified constants for the Citi Bike rebalancing pipeline. See PLAN_ML.md."""
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT
OUTPUT_DIR = ROOT / "outputs"

CSV_GLOB = "JC-*-citibike-tripdata.csv"

# Read these as text, never numeric (§2).
ID_COLS = ["start_station_id", "end_station_id"]

# §0 windows: (start_hour inclusive, end_hour inclusive). AM 06:00-11:59, PM 14:00-19:59.
WINDOWS = {"AM": (6, 11), "PM": (14, 19)}

QUANTILES = [0.5, 0.9]

# §3 single weather series for the whole zone.
CENTROID_LAT, CENTROID_LNG = 40.72, -74.04
WEATHER_START, WEATHER_END = "2025-09-30", "2026-09-30"
TIMEZONE = "America/New_York"

# §2.1 station relocations to unify under station_key: old_id -> canonical (current) id.
RELOCATIONS = {
    "HB106": "HB107",
    "HB508": "HB503",
    "JC148": "JC149",
}

# §2 exact expected affected-row counts. Pipeline halts if any mismatch.
EXPECTED_COUNTS = {
    "rule1_no_start_id": 4,
    "rule2_dup_ride_id": 18,
    "rule3_bad_duration": 7,
    "rule4_recovered_end_id": 1535,
    "rule5_no_dest": 4027,
    "rule6_arrival_over_24h": 563,
    "rule7_arrival_outside_114": 3048,
}

N_START_STATIONS = 114
MAX_TRIP_HOURS = 24  # §2 rule 6

# §2 JC118 has two names for one id; keep the most frequent.
JC118_ID = "JC118"

# §2.3 DST handling (local NY time).
DST_DROP = ("2026-03-08", 2)      # spring-forward: hour 2 does not exist, do not fill.
DST_COLLAPSE = ("2025-11-02", 1)  # fall-back: hour 1 occurs twice, collapsed. Declare only.

# §5.3 temporal folds: one per month over the whole year (rolling origin). Each trains on
# everything before its month and tests on that month. December is the first month with
# enough history (October rows lack the 4-week lags).
def _month_fold(month):
    start = pd.Timestamp(month + "-01")
    end = start + pd.offsets.MonthEnd(0)
    return {"name": month, "train_end": (start - pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
            "test_start": start.strftime("%Y-%m-%d"), "test_end": end.strftime("%Y-%m-%d")}


FOLDS = [_month_fold(m) for m in pd.period_range("2025-12", "2026-09", freq="M").astype(str)]
# Only the last three months go to the dashboard map and hourly detail (keeps the files small).
DISPLAY_FOLDS = FOLDS[-3:]
# §7.4 forecast model trains on every validated month (through the last fold's test end).
FORECAST_TRAIN_END = FOLDS[-1]["test_end"]
# System total: sum of station p50 times a factor that covers this share of past days.
SYSTEM_COVERAGE = 0.9
# The factor is learned from the past days in this many days before the scored month
# (12 weeks: closest to 90% coverage in Jul-Sep), so winter swings do not inflate a summer factor.
SYSTEM_LOOKBACK_DAYS = 84

# §5.3 stations with no activity in the test window -> exclude from evaluation.
EVAL_EXCLUDE = ["HB410", "JC104", "JC125", "JC147"]
# §2.1 report separately in August (relocated, level not inherited).
REPORT_SEPARATELY_AUG = ["HB107"]

# §5.2 conservative LightGBM hyperparameters.
LGBM_PARAMS = {
    "objective": "quantile",
    "num_leaves": 31,
    "min_data_in_leaf": 50,
    "learning_rate": 0.05,
    "n_estimators": 2000,  # capped by early stopping
    "verbose": -1,
}
LGBM_EARLY_STOPPING = 50

# §4.2 features for the window model. station/window/day are categorical.
CATEGORICAL_FEATURES = ["station_key", "ventana", "dia_semana"]
LAG_FEATURES = ["necesidad_hace_7d", "necesidad_media_4sem", "salidas_media_4sem"]
WEATHER_FEATURES = ["temp_media", "precip_total", "hubo_lluvia", "viento_max"]
BOOL_FEATURES = ["es_fin_de_semana", "es_festivo"]

# §5.5 reference floor: median profile correlation between any two stations.
PROFILE_CORR_FLOOR = 0.744

# §7.4 forecast mode horizon.
FORECAST_START, FORECAST_END = "2026-10-10", "2026-10-17"

# §5.5 KMeans segments.
KMEANS_K = 4
RANDOM_SEED = 42
