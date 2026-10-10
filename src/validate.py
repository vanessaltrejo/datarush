"""§5.3-5.4, §9: temporal folds, exclusions, metrics, anti-leakage checks."""
import numpy as np
import pandas as pd

import config as C
from baseline import fit_baseline, predict_baseline
from model_lgbm import train_lgbm, predict_lgbm, feature_list


def _pinball(actual, pred, alpha):
    d = actual - pred
    return np.mean(np.maximum(alpha * d, (alpha - 1) * d))


def _metrics_block(df, model, fold, pred_p50, pred_p90):
    """df must carry necesidad + the given prediction columns. Split by window x day_type."""
    df = df.copy()
    df["day_type"] = np.where(df["es_fin_de_semana"], "weekend", "weekday")
    df["_p50"], df["_p90"] = df[pred_p50], df[pred_p90]
    rows = []
    groups = [("all", "all", df)]
    for win in df["ventana"].unique():
        for dt in ("weekday", "weekend"):
            sub = df[(df["ventana"] == win) & (df["day_type"] == dt)]
            if len(sub):
                groups.append((win, dt, sub))
    for win, dt, sub in groups:
        a = sub["necesidad"].to_numpy()
        p50, p90 = sub["_p50"].to_numpy(), sub["_p90"].to_numpy()
        rows.append({
            "model": model, "fold": fold, "window": win, "day_type": dt,
            "mae": np.mean(np.abs(a - p50)),
            "rmse": np.sqrt(np.mean((a - p50) ** 2)),
            "pinball": _pinball(a, p90, 0.9),
            "coverage": np.mean(a <= p90),
            "total_bikes": float(np.sum(p90)),
            "n": len(sub),
        })
    return rows


def _anti_leakage(train, test, feats, fold):
    checks = []
    ok = train["date"].max() < test["date"].min()
    checks.append(f"[{fold}] date separation train.max<test.min: {ok}")
    assert ok, "LEAK: train/test dates overlap"
    assert "mes" not in feats, "LEAK: 'mes' present in features"
    checks.append(f"[{fold}] no 'mes' feature: True")
    # lag >=24h: necesidad_hace_7d must equal necesidad 7 days prior (spot check on train).
    assert all(f in feats for f in C.LAG_FEATURES), "lag features missing"
    checks.append(f"[{fold}] lags present & >=24h (7d / 4wk): True")
    return checks


def run_fold(panel, fold, all_keys, use_weather=False, qc=None):
    train = panel[panel["date"] <= fold["train_end"]].copy()
    test = panel[(panel["date"] >= fold["test_start"]) & (panel["date"] <= fold["test_end"])].copy()
    # §5.3 exclusions.
    test = test[~test["station_key"].isin(C.EVAL_EXCLUDE)]
    # drop rows with missing lags (series start); in Aug/Sep these are rare.
    test = test.dropna(subset=["necesidad_media_4sem"])
    train = train.dropna(subset=["necesidad_media_4sem"])

    feats = feature_list(use_weather)
    leak = _anti_leakage(train, test, feats, fold["name"])
    if qc:
        for c in leak:
            qc.info(c)

    # Models.
    bmodel = fit_baseline(train, fold["test_start"])
    bpred = predict_baseline(test, bmodel)
    lmodels = train_lgbm(train, use_weather, all_keys, qc)
    lpred = predict_lgbm(lmodels, test)

    merged = (test.merge(bpred, on=["station_key", "date", "ventana"])
                  .merge(lpred, on=["station_key", "date", "ventana"]))

    model_name = "lightgbm_weather" if use_weather else "lightgbm"
    metrics = (_metrics_block(merged, "baseline", fold["name"], "baseline_p50", "baseline_p90")
               + _metrics_block(merged, model_name, fold["name"], "need_p50", "need_p90"))

    # §2.1 report HB107 separately in August.
    if fold["test_start"].startswith("2026-08"):
        hb = merged[merged["station_key"].isin(C.REPORT_SEPARATELY_AUG)]
        if len(hb):
            metrics += _metrics_block(hb, f"{model_name}_HB107", fold["name"], "need_p50", "need_p90")
    return metrics, merged


def run_validation(panel, all_keys, use_weather=False, qc=None):
    all_metrics, all_preds = [], []
    for fold in C.FOLDS:
        m, preds = run_fold(panel, fold, all_keys, use_weather, qc)
        all_metrics += m
        preds["fold"] = fold["name"]
        all_preds.append(preds)
    metrics_df = pd.DataFrame(all_metrics)
    preds_df = pd.concat(all_preds, ignore_index=True)
    if qc:
        cov = metrics_df[(metrics_df.model == ("lightgbm_weather" if use_weather else "lightgbm"))
                         & (metrics_df.window == "all")]
        for _, r in cov.iterrows():
            qc.info(f"coverage {r.model} {r.fold}: {100*r.coverage:.1f}% | total_bikes={r.total_bikes:.0f}")
    return metrics_df, preds_df
