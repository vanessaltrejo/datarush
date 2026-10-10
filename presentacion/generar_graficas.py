import sys, pandas as pd, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path
ROOT = Path(sys.argv[1]); OUT = ROOT / "presentacion"; O = ROOT / "outputs"
BG, INK, MUTED, GRID, LIME, GRAY, RED = "#1D1D1D", "#D9D9D9", "#9A9A9A", "#333333", "#C1FF72", "#8A8F98", "#FF6B5B"
plt.rcParams.update({"figure.facecolor": BG, "axes.facecolor": BG, "savefig.facecolor": BG,
    "text.color": INK, "axes.labelcolor": MUTED, "xtick.color": MUTED, "ytick.color": MUTED,
    "axes.edgecolor": GRID, "font.family": "DejaVu Sans", "font.size": 15,
    "axes.spines.top": False, "axes.spines.right": False})
def save(fig, name): fig.savefig(OUT / name, dpi=200, bbox_inches="tight", pad_inches=0.3); plt.close(fig)

pw = pd.read_csv(O / "predictions_window.csv", parse_dates=["date"])
st = pd.read_csv(O / "stations.csv")

# 1. Grove St PATH: cumulative arrivals - departures on one weekday afternoon.
g = pw[(pw.station_key == "JC115") & (pw.window == "PM") & (pw["mode"] == "backtest")
       & (pw.date.dt.month == 9) & (pw.date.dt.dayofweek < 5)].dropna(subset=["need_actual"])
day = g.iloc[(g.need_actual - g.need_actual.quantile(0.75)).abs().argsort().iloc[0]]
d = day.date.strftime("%Y-%m-%d")
t = pd.read_csv(ROOT / "JC-202609-citibike-tripdata.csv", dtype={"start_station_id": str, "end_station_id": str},
                usecols=["started_at", "ended_at", "start_station_id", "end_station_id"])
lo, hi = pd.Timestamp(d + " 14:00"), pd.Timestamp(d + " 20:00")
dep = pd.to_datetime(t.loc[t.start_station_id == "JC115", "started_at"], format="mixed")
arr = pd.to_datetime(t.loc[t.end_station_id == "JC115", "ended_at"], format="mixed")
ev = pd.concat([pd.Series(-1, index=dep[(dep >= lo) & (dep < hi)]), pd.Series(1, index=arr[(arr >= lo) & (arr < hi)])]).sort_index()
cum = ev.cumsum()
xs = [lo] + list(ev.index) + [hi]; y = np.r_[0, cum.values, cum.values[-1]]
fig, ax = plt.subplots(figsize=(12, 5.5))
ax.step(xs, y, where="post", color=LIME, lw=2.5)
ax.fill_between(xs, y, 0, step="post", where=y < 0, color=RED, alpha=0.18, lw=0)
ax.axhline(0, color=MUTED, lw=1)
i = int(np.argmin(y[:-1])); ax.scatter([xs[i]], [y[i]], s=90, color=RED, zorder=5, edgecolor=BG, lw=2)
ax.annotate(f"Peor punto: faltan {-y[i]} bicis", (xs[i], y[i]), xytext=(0, 28), textcoords="offset points", ha="center",
            color=INK, fontsize=17, fontweight="bold", va="center")
ax.set_xlim(lo, hi); ax.xaxis.set_major_formatter(matplotlib.dates.DateFormatter("%H:%M"))
ax.set_ylabel("Llegadas − salidas (acumulado)"); ax.grid(axis="y", color=GRID, lw=0.8)
ax.set_title(f"Grove St PATH, tarde del {day.date.day} sep 2026", loc="left", fontsize=19, color=INK, pad=14)
save(fig, "1_grove_st_curva.png")

# 2. Morning vs afternoon need maps (mean actual need, Sep weekdays).
s = pw[(pw["mode"] == "backtest") & (pw.date.dt.dayofweek < 5)].groupby(["station_key", "window"]).need_actual.mean().unstack()
s = s.join(st.set_index("station_key")[["lat", "lng", "name"]]).dropna(subset=["lat"])
fig, axes = plt.subplots(1, 2, figsize=(13, 7.5))
for ax, w, lab in zip(axes, ["AM", "PM"], ["Mañana 6–12 h", "Tarde 14–20 h"]):
    v = s[w].fillna(0)
    ax.scatter(s.lng, s.lat, s=12, color=GRID)
    ax.scatter(s.lng, s.lat, s=v * 14, color=LIME, alpha=0.85, edgecolor=BG, lw=1)
    top = s.loc[v.idxmax()]
    ax.annotate(f"{top['name']}\n{v.max():.0f} bicis", (top.lng, top.lat), xytext=(12, 12), textcoords="offset points",
                color=INK, fontsize=12)
    ax.set_title(lab, fontsize=20, color=INK); ax.set_aspect(1.32); ax.axis("off")
fig.suptitle("Necesidad promedio por estación (días entre semana, jul–sep)", color=MUTED, fontsize=14, y=0.04)
save(fig, "2_mapa_manana_vs_tarde.png")

# 3. MAE by test month: baseline vs our model.
m = pd.read_csv(O / "metrics.csv"); m = m[(m.window == "all") & m.model.isin(["baseline", "lightgbm_weather"])]
piv = m.pivot(index="fold", columns="model", values="mae").sort_index()
cov = m[m.model == "lightgbm_weather"].set_index("fold").coverage.sort_index()
months = ["Julio", "Agosto", "Septiembre"]; xi = np.arange(3); wdt = 0.36
fig, ax = plt.subplots(figsize=(12, 6))
b1 = ax.bar(xi - wdt/2 - 0.01, piv.baseline, wdt, color=GRAY, label="Mediana de las últimas 8 semanas (referencia)")
b2 = ax.bar(xi + wdt/2 + 0.01, piv.lightgbm_weather, wdt, color=LIME, label="Nuestro modelo (LightGBM + clima)")
for bars in (b1, b2):
    for r in bars: ax.text(r.get_x() + r.get_width()/2, r.get_height() + 0.03, f"{r.get_height():.2f}", ha="center", color=INK, fontsize=15)
for k, c in enumerate(cov): ax.text(xi[k], -0.28, f"cubre {100*c:.0f}% de los casos", ha="center", color=MUTED, fontsize=12)
ax.set_xticks(xi, months, color=INK, fontsize=16); ax.set_ylim(0, 2.5); ax.set_yticks([])
ax.spines["left"].set_visible(False)
ax.set_title("Error promedio (bicis por estación y ventana) · menos es mejor", loc="left", fontsize=17, color=INK, pad=14)
ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.14), ncol=2, fontsize=13, labelcolor=INK)
save(fig, "3_error_por_mes.png")

# 4. Validation timeline: 3 folds + forecast.
fig, ax = plt.subplots(figsize=(13, 4.8))
start = pd.Timestamp("2025-10-01")
rows = [("Corte 1", "2026-06-30", "2026-07-31", "prueba jul"), ("Corte 2", "2026-07-31", "2026-08-31", "prueba ago"),
        ("Corte 3", "2026-08-31", "2026-09-30", "prueba sep"), ("Pronóstico", "2026-09-30", "2026-10-17", "10–17 oct")]
for k, (lab, te, pe, txt) in enumerate(rows):
    yk = len(rows) - 1 - k; te, pe = pd.Timestamp(te), pd.Timestamp(pe)
    ax.barh(yk, (te - start).days, left=0, height=0.55, color=GRAY if lab != "Pronóstico" else "#5C6066")
    if lab == "Pronóstico":
        ax.barh(yk, (pe - pd.Timestamp("2026-10-10")).days, left=(pd.Timestamp("2026-10-10") - start).days, height=0.55, color=LIME, hatch="//", edgecolor=BG)
    else:
        ax.barh(yk, (pe - te).days, left=(te - start).days + 1, height=0.55, color=LIME)
    ax.text(-8, yk, lab, ha="right", va="center", color=INK, fontsize=15)
    ax.text((pe - start).days + 4, yk, txt, va="center", color=MUTED, fontsize=13)
ticks = pd.date_range(start, "2026-10-01", freq="MS")
ax.set_xticks([(d - start).days for d in ticks], [["oct", "nov", "dic", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct"][i] for i in range(len(ticks))])
ax.set_yticks([]); ax.spines["left"].set_visible(False); ax.set_xlim(-2, 400)
ax.set_title("Entrena (gris) solo con el pasado → prueba (verde) en el mes siguiente", loc="left", fontsize=17, color=INK, pad=14)
save(fig, "4_validacion_3_cortes.png")
print("ok", d, -y.min())
