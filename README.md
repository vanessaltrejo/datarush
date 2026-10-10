# Data Rush — ML de Rebalanceo de Citi Bike (Jersey City y Hoboken)

Predice un **nivel objetivo de inventario** por estación y ventana horaria — por ejemplo
*"Grove St PATH necesita 97 bicicletas a las 14:00"* — para que los operadores reabastezcan las
estaciones **antes** de que se vacíen. Cubre 114 estaciones de Jersey City / Hoboken,
oct 2025 – sep 2026 (972,092 viajes).

La salida es un *nivel*, no una orden de movimiento: no conocemos el inventario inicial de cada
estación, así que el operador lee el objetivo y calcula él mismo el faltante (lógica de stock de
seguridad).

## Qué responde el modelo

Para cada `estación × fecha × ventana` predice `necesidad` = el pico de déficit de bicicletas
durante la ventana, definido como el peor punto de la curva acumulada de `llegadas − salidas`:

```
necesidad = máx( 0 , − mín_t [ Σ_{u ≤ t} (llegadas_u − salidas_u) ] )
```

Dos ventanas: **AM** 06:00–11:59 (vaciado residencial) y **PM** 14:00–19:59 (vaciado de hubs de transporte).

## Modelos

- **Baseline** — p50/p90 empíricos por `estación × ventana × tipo_de_día` sobre las últimas 8 semanas. La red de seguridad.
- **LightGBM** — un regresor de cuantiles global (τ=0.5 y τ=0.9), estación como variable categórica,
  recalibración conforme (CQR) para que τ=0.9 quede cerca del 90% de cobertura. Variables de clima de Open-Meteo.

Validado con dos cortes temporales (entrena→jul / prueba ago, entrena→ago / prueba sep). La métrica
principal es **bicicletas comprometidas a igual cobertura (~90%)** — la moneda del operador — no el MAE.

## Estructura del repositorio

```
src/
  config.py         constantes verificadas (conteos, ventanas, cortes, reubicaciones, hiperparámetros)
  load_clean.py     carga los 12 CSV, reglas de limpieza con conteos aseverados, unificación station_key
  panel_hourly.py   panel horario (estación × hora), ceros solo dentro de la ventana de actividad de cada estación
  weather.py        Open-Meteo archivo + pronóstico, agregado a ventanas
  panel_window.py   panel de ventana + objetivo `necesidad` + variables de rezago/calendario/clima
  baseline.py       baseline de cuantiles empíricos
  model_lgbm.py     entrenamiento de cuantiles LightGBM + calibración conforme
  validate.py       cortes temporales, métricas, chequeos anti-fuga
  segments.py       segmentos KMeans sobre perfiles horarios de 24h
  forecast_mode.py  pronóstico precargado para fechas futuras (10–17 oct)
  hourly_model.py   detalle horario de salidas para el clic en estación
  export.py         escribe el contrato de CSV + data.js
run_pipeline.py     orquesta todo en orden; escribe outputs/ + qc_log.txt
outputs/            CSVs generados, data.js (datos del dashboard), qc_log.txt
JC-*.csv            datos crudos de viajes de Citi Bike (12 meses)
```

## Ejecución

```bash
pip install lightgbm scikit-learn holidays pandas numpy requests
python run_pipeline.py
```

Las salidas quedan en `outputs/`. El pipeline se **autovalida**: cada paso de limpieza asevera un
conteo exacto esperado y se detiene si no cuadra, y al final verifica resultados conocidos
(p. ej. Grove St PATH PM p90 ≈ 97).

## Salidas (contrato del dashboard)

| Archivo | Propósito |
|---|---|
| `predictions_window.csv` | **principal** — need_p50/p90 por estación·fecha·ventana, modos backtest + forecast |
| `stations.csv` | metadatos de estación, segmento, MAE/cobertura por estación |
| `metrics.csv` | comparación baseline vs LightGBM vs LightGBM+clima |
| `predictions_hourly.csv` | detalle horario para el clic en estación |
| `profiles.csv` | perfiles de mapa de calor horario |
| `routes.csv` | rutas estación-a-estación más usadas |
| `weather_effect.csv` | necesidad con lluvia vs sin lluvia |
| `data.js` / `data_hourly.js` / `data_profiles.js` | los mismos datos como objetos JS — el dashboard carga con `<script>` (funciona con doble clic, sin CORS) |

## Resultados clave (verificados)

- Los conteos de limpieza reproducen el spec exactamente (4 / 18 / 7 / 1535 / 4027 / 563 / 3048).
- Grove St PATH PM p90 = **96.9**, desbalance neto anual de Oakland Ave = **−1,793** (anclas de validación).
- A ~90% de cobertura, LightGBM le gana al baseline en MAE (1.88 vs 2.03) y en pinball; las bicicletas
  comprometidas quedan casi empatadas. El clima mejora el MAE ligeramente. La señal dominante es el
  nivel de 4 semanas — la demanda es rítmica, así que un promedio bien construido ya explica casi todo,
  y el valor está en el cuantil.

Consulta `CONTEXT.md` para el estado actual y el trabajo pendiente. Metodología completa en `PLAN_ML.md`.
