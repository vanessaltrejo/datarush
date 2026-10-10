"""§3: Open-Meteo weather. One hourly series for the zone; aggregated to windows."""
import pandas as pd
import requests

import config as C

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY_VARS = "temperature_2m,precipitation,wind_speed_10m"
_CACHE = C.OUTPUT_DIR / "weather_hourly.csv"


def _fetch(url, start, end):
    params = {
        "latitude": C.CENTROID_LAT, "longitude": C.CENTROID_LNG,
        "start_date": start, "end_date": end,
        "hourly": HOURLY_VARS, "timezone": C.TIMEZONE,
    }
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    h = r.json()["hourly"]
    df = pd.DataFrame({
        "datetime_hour": pd.to_datetime(h["time"]),
        "temp": h["temperature_2m"],
        "precip": h["precipitation"],
        "viento": h["wind_speed_10m"],
    })
    return df


def fetch_hourly_weather(qc=None, use_cache=True):
    if use_cache and _CACHE.exists():
        df = pd.read_csv(_CACHE, parse_dates=["datetime_hour"])
    else:
        df = _fetch(ARCHIVE_URL, C.WEATHER_START, C.WEATHER_END)
        C.OUTPUT_DIR.mkdir(exist_ok=True)
        df.to_csv(_CACHE, index=False)
    if qc:
        qc.info(f"weather hourly rows={len(df):,} ({df.datetime_hour.min()} .. {df.datetime_hour.max()})")
    return df


def _aggregate_to_windows(hourly):
    hourly = hourly.copy()
    hourly["date"] = hourly["datetime_hour"].dt.normalize()
    hourly["hour"] = hourly["datetime_hour"].dt.hour
    parts = []
    for name, (lo, hi) in C.WINDOWS.items():
        sub = hourly[(hourly["hour"] >= lo) & (hourly["hour"] <= hi)]
        agg = (sub.groupby("date")
               .agg(temp_media=("temp", "mean"),
                    precip_total=("precip", "sum"),
                    viento_max=("viento", "max"))
               .reset_index())
        agg["ventana"] = name
        parts.append(agg)
    out = pd.concat(parts, ignore_index=True)
    out["hubo_lluvia"] = out["precip_total"] > 0.1
    return out


def weather_window_features(qc=None, use_cache=True):
    return _aggregate_to_windows(fetch_hourly_weather(qc, use_cache))


def join_window_weather(window_panel, qc=None, use_cache=True):
    wx = weather_window_features(qc, use_cache)
    before = len(window_panel)
    out = window_panel.merge(wx, on=["date", "ventana"], how="left")
    if qc:
        miss = out["temp_media"].isna().sum()
        qc.info(f"weather join: rows {before}->{len(out)} (unchanged={before==len(out)}), missing temp={miss}")
    if before != len(out):
        raise AssertionError("weather join changed row count — timezone/DST problem (§3)")
    return out


def fetch_forecast_weather(start, end):
    """§7.4 forecast endpoint for future dates. Aggregated to windows."""
    return _aggregate_to_windows(_fetch(FORECAST_URL, start, end))


if __name__ == "__main__":
    from load_clean import QCLog
    qc = QCLog()
    wx = weather_window_features(qc, use_cache=True)
    print(wx.head().to_string())
    print("rain windows:", int(wx["hubo_lluvia"].sum()), "/", len(wx))
