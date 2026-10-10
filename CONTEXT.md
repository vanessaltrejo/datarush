# Project Context & Status

Snapshot of what exists and what is left. Full spec: `PLAN_ML.md` (§ references below).

## What we have (done)

**Data & cleaning (§1–2)** — `src/load_clean.py`
- Loads the 12 monthly CSVs, IDs read as text.
- 7 cleaning rules, each with an **asserted** exact count that halts the pipeline on mismatch:
  no start_id (4), duplicate ride_id (18), bad duration (7), recovered end_id by name (1535),
  no recoverable destination (4027, kept as departures), arrivals >24h (563), arrivals outside
  the 114 stations (3048). All match the verified spec numbers.
- `station_key` unification of 3 relocations (HB106→HB107, HB508→HB503, JC148→JC149) → 111 keys.
- Stations table with canonical id, name, coords, relocation flag.

**Panels (§4)** — `src/panel_hourly.py`, `src/panel_window.py`
- Hourly panel (station × hour) with departures (+member/casual), arrivals filtered to the 114 &
  <24h, zeros filled **only inside each station's activity window** (59.4% zero cells ≈ spec 59.3%).
  DST handled (2026-03-08 h2 dropped; 2025-11-02 h1 collapse noted).
- Window panel (station × date × window), ~67.7k active rows ≈ spec 67,488. Target `necesidad`
  via the cumulative-min deficit formula. Features: station_key, window, weekday, weekend,
  holiday, 7-day & 4-week lags, recent departures, weather. No `mes` feature (leakage).

**Weather (§3)** — `src/weather.py`
- Open-Meteo archive (no key), single series for the zone, `America/New_York`. Row-count checked.
- Window aggregates: temp mean, precip total, rain bool, max wind. Forecast endpoint for future dates.

**Models (§5)** — `src/baseline.py`, `src/model_lgbm.py`
- Baseline: 8-week rolling empirical p50/p90 per station × window × day_type.
- LightGBM: global quantile regressor (τ=0.5, 0.9), station categorical, conservative
  hyperparams, early stopping, **split-conformal (CQR) recalibration** → ~90% coverage.

**Validation (§5.3–5.4, §9)** — `src/validate.py`
- Two temporal folds; exclusions (HB410, JC104, JC125, JC147); HB107 reported separately in Aug.
- Metrics by model × fold × window × day_type: MAE, RMSE, pinball, coverage, committed bikes.
- Anti-leakage asserts: train/test date separation, no `mes`, lags ≥24h.

**Extras (§5.5, §7.4, §12)** — `src/segments.py`, `src/forecast_mode.py`, `src/hourly_model.py`
- KMeans segments over normalized 24h profiles (+ inter-station correlation floor reference).
- Forecast mode for 10–17 Oct 2026: frozen September lags + Open-Meteo forecast weather.
- Hourly departures detail (profile predictor) for the click-through view.

**Outputs (§7)** — `src/export.py`, `run_pipeline.py`
- All 7 CSVs + `data.js` / `data_hourly.js` / `data_profiles.js` (double-click safe, no CORS).
- `qc_log.txt` with every count and sanity check.
- End-to-end sanity checks pass: Grove St PATH PM p90 = 96.9 (~97), Oakland net = −1,793 (~−1,807),
  coverage ~90%.

**Primary model:** LightGBM **with weather** (set in `run_pipeline.py`). Metrics keep all three
models so the baseline vs no-weather vs weather comparison stays visible.

## What's missing / next steps

1. **Dashboard (frontend).** Not in this repo by design — a teammate builds the HTML/JS map +
   backtest/forecast tabs on top of `outputs/data.js`. This is where the demo points live.
2. **Third fold (low season).** `FOLD_FEB` is defined in `config.py` but not wired into
   `run_validation`. Add it to report off-season performance (metrics currently describe high
   season Aug–Sep only).
3. **Coverage calibration review.** The combined "mean coverage" sanity line reads ~92% because it
   averages in the small HB107 group and the weather model; per-fold core coverage is ~89–90%.
   Consider reporting coverage per model explicitly rather than a blended mean.
4. **Interval-width metric.** Spec names "interval width at equal coverage" as the key LightGBM
   advantage; `metrics.csv` currently exposes committed bikes (a proxy). Could add an explicit
   `interval_width` (p90−p50) column for the pitch.
5. **GBFS (future project step).** Real-time capacity/inventory is out of scope — needs weeks of
   feed captures. Declared as the natural next phase (the capacity question for Grove St PATH).
6. **Departures predictor.** `departures_pred` in the window output uses the 4-week mean, not a
   dedicated model. Fine for now; could be upgraded if the dashboard needs sharper demand numbers.

## Known limitations (surface on the dashboard)

- Recommendation assumes the station starts the window balanced (no real inventory data).
- Demand is censored: trips that didn't happen because a station was empty aren't in the data →
  numbers are a floor.
- Station anchor capacity unknown (strongest argument for GBFS next).
- Arrivals from outside the zone (<1% of trips) aren't in the source.
- Metrics measured in high season (Aug–Sep).
