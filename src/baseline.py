"""§5.1 baseline: empirical quantiles per station_key x ventana x day_type, last 8 weeks."""
import numpy as np
import pandas as pd

import config as C

ROLL_WEEKS = 8


def _day_type(df):
    return np.where(df["es_fin_de_semana"], "weekend", "weekday")


def fit_baseline(train_df, ref_date):
    """Empirical p50/p90 over the 8 weeks of training data before ref_date."""
    ref = pd.Timestamp(ref_date)
    window = train_df[train_df["date"] >= ref - pd.Timedelta(weeks=ROLL_WEEKS)].copy()
    full = train_df.copy()
    for d in (window, full):
        d["day_type"] = _day_type(d)

    def table(df):
        return (df.groupby(["station_key", "ventana", "day_type"])["necesidad"]
                .agg(p50=lambda s: s.quantile(0.5), p90=lambda s: s.quantile(0.9))
                .reset_index())

    g8 = table(window).set_index(["station_key", "ventana", "day_type"])
    gall = table(full).set_index(["station_key", "ventana", "day_type"])  # fallback
    glob = {"p50": full["necesidad"].quantile(0.5), "p90": full["necesidad"].quantile(0.9)}
    return {"w8": g8, "all": gall, "glob": glob}


def predict_baseline(test_df, model):
    g8, gall, glob = model["w8"], model["all"], model["glob"]
    dt = _day_type(test_df)
    keys = list(zip(test_df["station_key"], test_df["ventana"], dt))
    out = test_df.copy()
    for q in ("p50", "p90"):
        vals = []
        for k in keys:
            if k in g8.index:
                vals.append(g8.loc[k, q])
            elif k in gall.index:
                vals.append(gall.loc[k, q])
            else:
                vals.append(glob[q])
        out[f"baseline_{q}"] = vals
    return out[["station_key", "date", "ventana", "baseline_p50", "baseline_p90"]]
