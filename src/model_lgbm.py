"""§5.2: one global LightGBM quantile regressor per alpha (0.5, 0.9)."""
import lightgbm as lgb
import numpy as np
import pandas as pd

import config as C


def feature_list(use_weather):
    feats = list(C.CATEGORICAL_FEATURES) + list(C.BOOL_FEATURES) + list(C.LAG_FEATURES)
    if use_weather:
        feats += list(C.WEATHER_FEATURES)
    return feats


def _prep(df, feats, all_station_keys):
    X = df[feats].copy()
    X["station_key"] = pd.Categorical(X["station_key"], categories=all_station_keys)
    X["ventana"] = pd.Categorical(X["ventana"], categories=list(C.WINDOWS.keys()))
    X["dia_semana"] = pd.Categorical(X["dia_semana"], categories=list(range(7)))
    for b in C.BOOL_FEATURES:
        X[b] = X[b].astype(int)
    if "hubo_lluvia" in X.columns:
        X["hubo_lluvia"] = X["hubo_lluvia"].astype(int)
    return X


def train_lgbm(train_df, use_weather, all_station_keys, qc=None):
    feats = feature_list(use_weather)
    cat = [f for f in C.CATEGORICAL_FEATURES if f in feats]
    # Early-stopping validation = latest 15% of train by date.
    cutoff = train_df["date"].quantile(0.85)
    tr = train_df[train_df["date"] <= cutoff]
    va = train_df[train_df["date"] > cutoff]
    Xtr, Xva = _prep(tr, feats, all_station_keys), _prep(va, feats, all_station_keys)
    models = {}
    for alpha in C.QUANTILES:
        params = dict(C.LGBM_PARAMS, alpha=alpha)
        m = lgb.LGBMRegressor(**params)
        m.fit(Xtr, tr["necesidad"],
              eval_set=[(Xva, va["necesidad"])],
              eval_metric="quantile",
              categorical_feature=cat,
              callbacks=[lgb.early_stopping(C.LGBM_EARLY_STOPPING, verbose=False)])
        models[alpha] = m
        if qc:
            qc.info(f"lgbm alpha={alpha} best_iter={m.best_iteration_} weather={use_weather}")
    # §9 recalibrate (not retrain): split-conformal (CQR) offset for the 0.9 quantile
    # so test coverage lands near 90%. Learned on the held-out validation slice only.
    p90_va = models[0.9].predict(Xva)
    resid = va["necesidad"].to_numpy() - p90_va
    n = len(resid)
    level = min(0.999, np.ceil((n + 1) * 0.9) / n)
    models["_cqr90"] = float(np.quantile(resid, level))
    if qc:
        qc.info(f"CQR offset (alpha=0.9): {models['_cqr90']:+.2f}")
    models["_feats"] = feats
    models["_keys"] = all_station_keys
    return models


def predict_lgbm(models, df):
    feats, keys = models["_feats"], models["_keys"]
    X = _prep(df, feats, keys)
    p50 = models[0.5].predict(X)
    p90 = models[0.9].predict(X) + models.get("_cqr90", 0.0)  # §9 conformal recalibration
    # Quantile crossing guard + non-negativity (counts).
    p50 = np.clip(p50, 0, None)
    p90 = np.clip(p90, 0, None)
    p90 = np.maximum(p90, p50)
    out = df[["station_key", "date", "ventana"]].copy()
    out["need_p50"], out["need_p90"] = np.round(p50, 1), np.round(p90, 1)
    return out
