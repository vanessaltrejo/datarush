# Data Rush — ML de Rebalanceo de Citi Bike (Jersey City y Hoboken)

Predice un **nivel objetivo de inventario** por estación y ventana horaria — por ejemplo
*"Grove St PATH necesita 97 bicicletas a las 14:00"* — para que los operadores reabastezcan las
estaciones **antes** de que se vacíen. Cubre 114 estaciones de Jersey City / Hoboken,
oct 2025 – sep 2026 (972,092 viajes), y trae un dashboard web para consultar las recomendaciones.

La salida es un *nivel*, no una orden de movimiento: no conocemos el inventario inicial de cada
estación, así que el operador lee el objetivo y calcula él mismo el faltante (lógica de stock de
seguridad).

## Resultados clave

| | Referencia (mediana de 8 semanas) | LightGBM + clima |
|---|---|---|
| Error promedio (MAE, bicis por estación y ventana), dic 2025 – sep 2026 | 1.94 | **1.79** (−7.9%) |
| Cobertura del nivel seguro (p90) en el año | 88.9% | **90.2%** |
| Meses en que gana | — | **9 de 10** (enero es la excepción) |

- **Total del sistema calibrado:** pide en promedio **1.2 veces** lo que se usó y alcanza el 87.5% de
  los días de julio a septiembre. Sumar el p90 de cada estación pediría 1.9 veces.
- **A igual cobertura**, el modelo pide 3.0% menos bicis que la referencia en agosto y 7.7% menos en
  septiembre; en julio empatan (la referencia pide 1.2% menos).
- **Anclas de validación:** Grove St PATH PM p90 = **96.9**; desbalance neto anual de Oakland Ave =
  **−1,793**. Los conteos de limpieza reproducen el spec exactamente (4 / 18 / 7 / 1535 / 4027 / 563 / 3048).
- La señal dominante es el nivel de las últimas 4 semanas: la demanda es rítmica, así que un promedio
  bien construido ya explica casi todo, y el valor está en el cuantil.

## Qué responde el modelo

Para cada `estación × fecha × ventana` predice `necesidad` = el pico de déficit de bicicletas
durante la ventana, definido como el peor punto de la curva acumulada de `llegadas − salidas`:

```
necesidad = máx( 0 , − mín_t [ Σ_{u ≤ t} (llegadas_u − salidas_u) ] )
```

Dos ventanas: **AM** 06:00–11:59 (vaciado residencial) y **PM** 14:00–19:59 (vaciado de hubs de transporte).
Da dos niveles: **típico (p50)**, que alcanza la mitad de los días, y **seguro (p90)**, que alcanza 9 de cada 10.

## Modelos

- **Referencia (baseline)** — p50/p90 empíricos por `estación × ventana × tipo_de_día` sobre las últimas
  8 semanas. La red de seguridad: si el modelo no le gana, no aporta.
- **LightGBM** — un regresor de cuantiles global (τ=0.5 y τ=0.9), estación como variable categórica.
  Variables: día de la semana, fin de semana, festivo, necesidad hace 7 días, promedio de 4 semanas,
  salidas recientes y clima de Open-Meteo. El p90 se recalibra (CQR) para que cubra cerca del 90%.
- **Total del sistema** — no suma el p90 de cada estación (eso supone que todas tienen su peor día a la
  vez). Es la suma de los p50 por un factor: el percentil 90 de `real / suma de p50` en las 12 semanas
  anteriores, por ventana (`src/system_total.py`).

## Validación

Mes a mes, de **diciembre 2025 a septiembre 2026** (10 cortes): cada mes se predice con un modelo
entrenado solo con los meses anteriores. Octubre y noviembre de 2025 no se evalúan porque les falta
historia para las variables de 4 semanas. Sin fugas: train y test no se mezclan, no hay variable de mes
y todos los rezagos tienen al menos 24 horas.

El **pronóstico (10–17 oct 2026)** se entrena con todo hasta el 30 sep y usa el clima pronosticado de
Open-Meteo. Esos días no se pueden verificar; su calidad se infiere de la validación.

## Estructura del repositorio

```
src/
  config.py         constantes verificadas (conteos, ventanas, cortes mensuales, reubicaciones, hiperparámetros)
  load_clean.py     carga los 12 CSV, reglas de limpieza con conteos aseverados, unificación station_key
  panel_hourly.py   panel horario (estación × hora), ceros solo dentro de la ventana de actividad de cada estación
  weather.py        Open-Meteo archivo + pronóstico, agregado a ventanas
  panel_window.py   panel de ventana + objetivo `necesidad` + variables de rezago/calendario/clima
  baseline.py       baseline de cuantiles empíricos
  model_lgbm.py     entrenamiento de cuantiles LightGBM + calibración conforme
  validate.py       cortes temporales, métricas, chequeos anti-fuga
  system_total.py   total del sistema calibrado (suma de p50 × factor de las 12 semanas anteriores)
  segments.py       segmentos KMeans sobre perfiles horarios de 24h
  forecast_mode.py  pronóstico precargado para fechas futuras (10–17 oct)
  hourly_model.py   detalle horario de salidas para el clic en estación
  export.py         escribe el contrato de CSV + data.js
run_pipeline.py     orquesta todo en orden; escribe outputs/ + qc_log.txt
outputs/            CSVs generados, data.js, qc_log.txt
dashboard/          dashboard web (Next.js) que lee outputs/ — ver dashboard/README.md
presentacion/       gráficas del pitch y el script que las genera
JC-*.csv            datos crudos de viajes de Citi Bike (12 meses)
```

## Ejecución

**Pipeline** (Python 3.11):

```bash
pip install lightgbm scikit-learn holidays pandas numpy requests
python run_pipeline.py
```

Las salidas quedan en `outputs/`. El pipeline se **autovalida**: cada paso de limpieza asevera un
conteo exacto esperado y se detiene si no cuadra, y al final verifica resultados conocidos
(p. ej. Grove St PATH PM p90 ≈ 97). Necesita internet para el clima de Open-Meteo.

**Dashboard** (Node 20 o más reciente):

```bash
cd dashboard
npm install
npm run dev
```

Abre http://localhost:3000. `npm run dev` y `npm run build` primero corren `scripts/prepareData.mjs`,
que lee `outputs/` y los CSV crudos, verifica los conteos y escribe `dashboard/public/data/*.json`.
Detalles y despliegue en Vercel en `dashboard/README.md`.

## Dashboard

- **Necesidad por estación:** tarjetas de movimiento de bicis y clima del día elegido; mapa (pines al
  inicio, círculos al elegir un modo) con los controles al costado; recomendación del sistema, estación
  en foco y top 10. Modos: datos pasados (1 jul – 30 sep, comparados contra lo real) y pronóstico (10–17 oct).
- **Demanda y causas:** perfiles horarios, rutas y efecto de la lluvia.
- **Calidad del modelo:** métricas de los 10 meses, comparación a igual cobertura y cómo funciona.

El mapa y el detalle por estación muestran julio a septiembre; las métricas cubren los 10 meses
(exportar todo el año pasaría el límite de 100 MB por archivo de GitHub).

## Salidas (contrato del dashboard)

| Archivo | Propósito |
|---|---|
| `predictions_window.csv` | **principal** — need_p50/p90 por estación·fecha·ventana; backtest (jul–sep) + forecast |
| `system_totals.csv` | total del sistema calibrado por fecha·ventana (suma de p50, factor, total p90, real) |
| `stations.csv` | metadatos de estación, segmento, MAE/cobertura por estación |
| `metrics.csv` | referencia vs LightGBM vs LightGBM+clima, por mes, ventana y tipo de día |
| `predictions_hourly.csv` | detalle horario para el clic en estación |
| `profiles.csv` | perfiles de mapa de calor horario |
| `routes.csv` | rutas estación-a-estación más usadas |
| `weather_effect.csv` | necesidad con lluvia vs sin lluvia |
| `weather_hourly.csv` / `weather_forecast_hourly.csv` | clima por hora: histórico y el pronóstico que usó el modelo |
| `data.js` / `data_hourly.js` / `data_profiles.js` | los mismos datos como objetos JS, para usarlos sin servidor |

## Limitaciones

- La recomendación asume que la estación empieza la ventana balanceada: no hay datos de inventario real.
- La demanda observada es un piso: quien encontró la estación vacía no aparece en los datos.
- La capacidad de cada estación es desconocida (el siguiente paso natural es el feed GBFS en tiempo real).
- Enero es el mes más difícil (frío, nieve, pocos viajes): ahí la referencia gana.
- Los viajes que llegan desde fuera de la zona (<1%) no están en la fuente.

Metodología completa en `PLAN_ML.md`.
