# Plan de ejecución ML — Citi Bike, área metropolitana de Nueva York (Jersey City y Hoboken)

**Para:** Claude Code
**Entrega del modelo:** 10 de octubre de 2026, 3:00 am · **Resto:** 3:00 pm
**Datos:** 12 CSV, octubre 2025 – septiembre 2026, **972,092 viajes**, 114 estaciones

> Todos los números de este documento están **verificados** ejecutando sobre los 12 CSV reales.
> No son estimaciones. Si al correr el pipeline un conteo no cuadra con el que aparece aquí,
> es que algo se rompió: detente y revisa antes de seguir.

---

## 0. Qué se está construyendo y por qué

**Pregunta que responde la herramienta:** ¿cuántas bicicletas debe haber en cada estación al inicio
de una ventana para que **no se vacíe** antes de satisfacer la demanda? Es preventivo, no correctivo.

**La salida NO es "mueve N bicicletas".** Es un **nivel objetivo**: *"Grove St PATH necesita 97
bicicletas a las 14:00"*. Esto es deliberado: no conocemos el inventario inicial, y un nivel
objetivo no lo necesita — el operador ve la estación y calcula el faltante él mismo. Es exactamente
lo que es un stock de seguridad en logística marítima: un objetivo, no una orden de movimiento.

**GBFS queda fuera.** No por viabilidad técnica sino por aritmética: el feed publica el estado
actual y harían falta semanas de capturas. Se declara como siguiente paso del proyecto.

### Definición formal del objetivo

Una estación se vacía cuando el déficit acumulado supera lo que tenía al inicio. Por eso el
objetivo **no** es el flujo neto al final de la ventana, sino el **peor momento del acumulado**:

```
necesidad(estación, fecha, ventana) = máx( 0 , − mín_t [ Σ_{u ≤ t} (llegadas_u − salidas_u) ] )
```

donde `t` recorre las horas de la ventana en orden.

**Esto importa, está medido:** sobre los 67,488 casos estación-día-ventana del año, el método
ingenuo (acumular el neto hasta el final) **subestima en el 33.8 % de los casos**, y en el **3.9 %**
dice literalmente "no mover nada" cuando la estación sí se queda sin bicis. La subestimación media
en los casos afectados es de 1.8 bicicletas, con máximo de 18. Siempre falla hacia el lado
peligroso, nunca sobreestima.

### Ventanas

| Ventana | Horas | Uso |
|---|---|---|
| `AM` | 06:00 – 11:59 | Barrios residenciales que se vacían en la mañana |
| `PM` | 14:00 – 19:59 | Hubs de transporte que se vacían en la tarde |

---

## 1. Contexto verificado de los datos

### 1.1 Lo que ya sabemos y no hay que volver a averiguar

- Los **12 archivos tienen esquema idéntico** (13 columnas, mismo orden). No hay nada que armonizar.
- Rango real: **2025-09-30 08:27:54** a **2026-09-30 23:55:36**.
- **114** `start_station_id` distintos. **498** `end_station_id` distintos.
- Las **coordenadas son perfectamente estables** por estación (dispersión máxima 0.000000°).
  Basta tomar `first`. No hay nada que reconciliar.
- Ningún viaje termina después del 2026-09-30, así que no se pierden llegadas por el borde superior.
- **16 viajes empiezan el 2025-09-30** (están dentro del archivo de octubre).

### 1.2 🔴 La trampa principal: las llegadas hay que filtrarlas a las 114

El archivo JC está filtrado **por estación de origen**. Por eso hay 498 destinos pero solo 114
orígenes: **384 estaciones aparecen solo como destino** y son de Manhattan (Vesey Pl & River
Terrace, W 34 St & 11 Ave, Park Ave & E 42 St…).

> **Regla:** `llegadas` se cuenta **solo sobre viajes cuyo `end_station_id` está entre las 114
> estaciones de origen.**

Si se agrupan las llegadas sin filtrar, el panel pasa de 114 a 498 estaciones y aparecen
**3,369,984 celdas basura** de estaciones que nunca tienen salidas. Es un error silencioso: el
pipeline corre, las métricas salen, y nadie lo nota.

**Consecuencia a declarar:** los viajes que entran desde Manhattan hacia la zona no están en esta
fuente. El sesgo es chico (las salidas hacia afuera son 3,048 al año, 0.31 %) y **subestima las
llegadas, lo que hace la necesidad estimada más conservadora** — o sea que falla hacia el lado
seguro. Una línea en la nota de límites del dashboard.

---

## 2. Limpieza — con los conteos exactos esperados

Cada regla deja una línea en un log de calidad. **Estos son los números que deben salir:**

| # | Regla | Filas afectadas | Nota |
|---|---|---|---|
| 1 | Descartar sin `start_station_id` | **4** | También les faltan coordenadas |
| 2 | Eliminar `ride_id` duplicados (`keep='first'`) | **18** | Son 36 filas, 18 pares |
| 3 | Descartar `ended_at <= started_at` | **7** | Todos negativos |
| 4 | Recuperar `end_station_id` por nombre | **1,535** | Tienen nombre pero no id |
| 5 | Viajes sin destino recuperable | **4,027** | **Se conservan**: cuentan como salida, no como llegada |
| 6 | Excluir de *llegadas* los viajes > 24 h | **563** | El máximo es 26.0 h |
| 7 | Excluir de *llegadas* los destinos fuera de las 114 | **3,048** | Ver §1.2 |

**Detalles que ahorran tiempo:**

- **Los 18 duplicados tienen causa conocida:** todos son viajes del 30 de abril que aparecen en el
  archivo de abril **y** en el de mayo. Son duplicados exactos en las 13 columnas, así que
  `keep='first'` es seguro.
- **No hay viajes de menos de 60 s que filtrar.** Los 7 de duración negativa son exactamente los
  mismos que los de menos de 60 s. La fuente ya cumple lo que promete.
- **Los viajes circulares (origen = destino) se conservan.** Son 35,196 (3.62 %). Aportan 0 al flujo
  neto pero son demanda real de salida.
- **`JC118` tiene dos nombres** para el mismo id: `Pacific Ave & Communipaw Ave` (7,138) y
  `Communipaw Ave & Pacific Ave` (1,358). Es el único caso. Tomar el más frecuente.
- Leer los IDs **como texto**, nunca como número.

### 2.1 Reubicaciones — unificar bajo `station_key`

Verificado por distancia y hueco temporal:

| Par | Distancia | Hueco | ¿Unir? |
|---|---|---|---|
| **HB106 → HB107** | 116 m | 2.1 h | **SÍ — obligatorio** |
| **HB508 → HB503** | 68 m | 16.1 h | **SÍ** |
| **JC148 → JC149** | 90 m | 8.9 h | **SÍ** |
| HB508 → HB506 | 613 m | 24.1 h | **NO** — es una estación nueva distinta |
| JC104 → HB410 | 2,711 m | 4.1 h | **NO** — no tienen relación |

**HB106 → HB107 es obligatorio porque sin eso el primer corte de validación está roto:** HB107
abrió el 31 de julio de 2026, así que al entrenar hasta julio y probar agosto tendría **8 viajes de
entrenamiento contra 2,585 de prueba**, y no es una estación pequeña (6,216 viajes en dos meses).

⚠️ **Pero no se hereda el nivel.** Medido: HB106 acumulaba **+42.3** bicicletas netas cada mañana,
HB107 solo **+13.4**. El desequilibrio cayó un 70 % tras la mudanza. La unión sirve para darle
**identidad e historia** al modelo; el nivel lo corrigen los rezagos. Esperar error elevado en
HB107 durante las primeras semanas de agosto y **reportarlo por separado en vez de esconderlo**.

Implementación: columna `station_key` en la tabla de estaciones, con ambos ids conservados. Se
modela sobre `station_key`; el mapa usa las coordenadas del id vigente.

### 2.2 Ventana de actividad y ceros estructurales

24 de las 114 estaciones abrieron o cerraron durante el año (13 abrieron entre el 6 y 23 de
diciembre; otras en marzo, abril, mayo, julio y agosto).

> **Regla:** la rejilla estación × hora se rellena con ceros **solo dentro de la ventana de
> actividad de cada estación** (primer a último viaje observado, ya con `station_key` aplicado).

Rellenar fuera de la ventana inventa ceros falsos que contaminan el baseline y disparan las
métricas. Con la ventana de actividad el panel queda en **59.3 % de celdas en cero** (sin ella
sería 62.8 %).

### 2.3 Horario local y cambio de hora

Las marcas de tiempo son **hora local de Nueva York**. Dos excepciones verificadas:

- **2026-03-08:** la hora 2 no existe (0 viajes). **No rellenar esa celda.**
- **2025-11-02:** la hora 1 ocurre dos veces y los datos la colapsan. **Declararlo**, no corregirlo.

---

## 3. Clima — Open-Meteo

El clima es **la razón principal por la que el LightGBM puede ganarle al baseline**: es la única
variable que una tabla de consulta `estación × día × hora` no puede capturar estructuralmente.

**Fuente:** API de archivo histórico de Open-Meteo (`archive-api.open-meteo.com/v1/archive`), que no
requiere llave.

| Parámetro | Valor |
|---|---|
| `latitude`, `longitude` | `40.72`, `-74.04` (centroide de la zona; una sola serie para las 114) |
| `start_date`, `end_date` | `2025-09-30`, `2026-09-30` |
| `hourly` | `temperature_2m`, `precipitation`, `wind_speed_10m` |
| `timezone` | `America/New_York` ← **crítico**, sin esto el join queda corrido |

Una sola serie horaria para toda la zona es suficiente: las 114 estaciones caben en ~6 km.

**Join:** por hora local contra el panel. Verificar que el conteo de filas no cambia tras el join;
si cambia, el problema es la zona horaria o el cambio de hora.

**Agregación a ventana** (el modelo de ventana no usa clima horario):
- `temp_media` — promedio de la ventana
- `precip_total` — suma de la ventana
- `hubo_lluvia` — booleano, `precip_total > 0.1 mm`
- `viento_max` — máximo de la ventana

⚠️ **Advertencia que no es obvia:** la lluvia reduce fuertemente la demanda, pero su efecto sobre la
*necesidad* puede ser débil, porque **suprime salidas y llegadas a la vez** y el desequilibrio queda
parecido. Es una hipótesis a verificar, no un supuesto. Si resulta que no se transfiere, **eso
también es un hallazgo presentable**.

**Supuesto a declarar:** usar el clima observado equivale a asumir pronóstico perfecto. Como se
predice a un día y en producción habría pronóstico real disponible, el supuesto es defendible. Una
línea en el dashboard.

**Si el clima falla o se acaba el tiempo:** seguir sin él. Pero generar de todos modos
`weather_effect.csv` (§7) con una tabla simple de demanda con lluvia contra sin lluvia — eso cubre
el requisito de "qué explica la demanda" de la rúbrica sin que el clima esté en el modelo.

---

## 4. Construcción del panel

### 4.1 Panel horario (insumo intermedio, no es el entregable)

Grano: una fila por `station_key × hora`, dentro de la ventana de actividad.

| Campo | Definición |
|---|---|
| `station_key`, `datetime_hour` | Llave |
| `salidas` | Viajes iniciados ahí en esa hora |
| `salidas_member`, `salidas_casual` | Desagregado por tipo de usuario (alimenta el "porqué") |
| `llegadas` | Viajes terminados ahí en esa hora — **filtrado a las 114, excluyendo > 24 h** |
| `flujo_neto` | `llegadas − salidas` |
| `temp`, `precip`, `viento` | Del join de clima |

### 4.2 Panel de ventana — **este es el objetivo del modelo**

Grano: una fila por `station_key × fecha × ventana`. Alrededor de **67,000 filas**. Entrena en
segundos.

**Objetivo:** `necesidad`, según la fórmula de §0.

**Variables:**

| Variable | Tipo | Nota |
|---|---|---|
| `station_key` | categórica | **Esencial**: es lo que permite a las estaciones chicas tomar fuerza prestada |
| `ventana` | categórica | AM / PM |
| `dia_semana` | categórica | 0–6 |
| `es_fin_de_semana` | bool | Efecto medido: entre semana 489 bicis, fin de semana 277 (**1.76x**) |
| `es_festivo` | bool | Librería `holidays`, calendario US |
| `necesidad_hace_7d` | float | Misma estación, misma ventana, misma hora de la semana |
| `necesidad_media_4sem` | float | Promedio de las 4 mismas (ventana, día de la semana) anteriores |
| `salidas_media_4sem` | float | Nivel de demanda reciente |
| `temp_media`, `precip_total`, `hubo_lluvia`, `viento_max` | float/bool | §3 |

**No incluir `mes`.** Con 12 meses de datos cada valor aparece una sola vez y el modelo lo usaría
como identificador del periodo de prueba. La estacionalidad entra por los rezagos.

**Todos los rezagos con al menos 24 h de desfase.** Se predice a un día: nada que el operador no
tendría disponible la noche anterior.

⚠️ **Dato medido que condiciona el diseño:** la autocorrelación de la necesidad diaria es **0.17**
con ayer y **0.22** con la semana pasada. El día exacto es en buena parte ruido; lo predecible es el
**nivel**. Por eso `necesidad_media_4sem` va a ser la variable dominante, y por eso el enfoque de
cuantiles no es un parche sino la respuesta correcta: como no se puede acertar el día, se dimensiona
para la distribución.

---

## 5. Modelos

### 5.1 Baseline — hacerlo primero, es el seguro

Cuantiles empíricos por `station_key × ventana × tipo_de_día` (entre semana / fin de semana),
calculados **solo con datos de entrenamiento**, sobre una ventana móvil de las últimas 8 semanas.

Produce `p50` y `p90` por grupo. Es rápido, es defendible, y **si el LightGBM falla a las 2:30 am
esto ya responde la pregunta del reto**.

### 5.2 Modelo principal — LightGBM, regresión por cuantiles

| Decisión | Valor | Por qué |
|---|---|---|
| Tipo | **Supervisado, regresión** | El objetivo es un conteo. No es clasificación ni multiclase |
| Objetivo | `objective='quantile'` | Pinball loss, la métrica propia de cuantiles |
| Cuantiles | `alpha=0.5` y `alpha=0.9` | **τ=0.9 ES la recomendación**; τ=0.5 es el escenario central |
| Alcance | **Un modelo global**, estación como categórica | Cada estación aporta solo ~730 filas; 114 modelos no se sostienen |
| Prophet / RNN | **No** | Panel de 114 series cortas, no una serie larga. Prophet exige un modelo por estación y no comparte información |

**Hiperparámetros conservadores** (114 niveles categóricos sobre 67k filas se sobreajusta fácil):
`num_leaves=31`, `min_data_in_leaf=50`, `learning_rate=0.05`, `n_estimators` con early stopping
sobre el pliegue de validación.

> **No tunear hasta que el LightGBM gane.** Dada la autocorrelación medida, es plausible que le gane
> poco al baseline. Si pasa, **es un hallazgo, no un fracaso**: significa que la demanda es tan
> rítmica que un promedio bien construido ya la explica, y que el valor está en el cuantil. Decirlo
> así en el pitch vale más que un ajuste forzado.

### 5.3 Validación temporal — dos cortes, sin azar

| Corte | Entrenamiento | Prueba |
|---|---|---|
| 1 | 2025-10-01 → 2026-07-31 | **agosto 2026** |
| 2 | 2025-10-01 → 2026-08-31 | **septiembre 2026** |

**Exclusiones obligatorias al evaluar** (si no, las métricas salen contaminadas):

- Estaciones **sin actividad en la ventana de prueba**: `HB410`, `JC104`, `JC125` (más las que
  quedan absorbidas por `station_key`). El modelo predeciría demanda para estaciones que ya cerraron.
- **`JC147`**: abrió el 31 de agosto de 2026, 92 viajes en total. Se excluye y se declara.
- Reportar **`HB107` por separado** en agosto (§2.1).

**Sesgo de temporada a declarar:** agosto es el mes #1 y septiembre el #4 de 12 por volumen. La
razón pico/valle del año es **4.31x** (febrero 25.8k viajes, agosto 111.2k). **Las métricas
describen desempeño en temporada alta únicamente.** Si sobra tiempo, agregar un tercer corte
(entrenar hasta enero, probar febrero) para cubrir temporada baja.

### 5.4 Métricas — el MAE no es la principal

| Métrica | Para qué | Meta |
|---|---|---|
| **Cobertura** | ¿En qué % de días la recomendación τ=0.9 alcanzó? | **~90 %** |
| **Bicicletas comprometidas** | Suma de la recomendación en todo el sistema | Menor es mejor |
| **Ancho de intervalo a cobertura igual** | **Aquí es donde el LightGBM debe ganar** | Menor es mejor |
| Pinball loss | Métrica de entrenamiento | — |
| MAE / RMSE en τ=0.5 | Comparación convencional | — |

**Cómo comparar bien.** Si comparas baseline contra LightGBM por MAE, probablemente empaten y
concluirás mal. La ventaja real del modelo son los **cuantiles condicionales**: intervalos angostos
en días predecibles y anchos en días inciertos, mientras el baseline solo puede dar el cuantil
marginal de cada estación, igual todos los días.

> **La pregunta correcta: a cobertura igual (90 %), ¿qué modelo compromete menos bicicletas?**
> Si LightGBM cubre el 90 % con menos bicicletas que el baseline, ganó — y ganó en la moneda del
> operador. Eso convence más que cualquier MAE.

Todas las métricas desagregadas **por estación, por ventana y por tipo de día**.

### 5.5 Segmentos — la pieza no supervisada

KMeans (k = 3 o 4) sobre el perfil horario normalizado de 24 h de cada estación. Nombrar los grupos
mirando la gráfica, no de antemano.

Esto le da al proyecto las dos familias que pide la rúbrica: **supervisado** para predecir,
**no supervisado** para explicar y accionar.

⚠️ **Referencia obligatoria antes de interpretar:** la correlación entre perfiles de **dos
estaciones cualesquiera** del sistema es mediana **0.744** y p90 **0.919**. Una correlación alta
solo significa algo si supera ese piso. Sin esta referencia es fácil concluir que dos estaciones
"se comportan igual" cuando en realidad todas se parecen.

---

## 6. Resultados esperados — contra qué contrastar

Si el pipeline está bien, estos números deben reaparecer. Son del verano de 2026.

**Necesidad por estación (bicicletas al inicio de la ventana):**

| Estación | Ventana | p50 | p80 | p90 | máx |
|---|---|---|---|---|---|
| Grove St PATH | PM | 60 | 87 | **97** | 112 |
| River St & Newark St | PM | 50 | 87 | **94** | 116 |
| River St & 1 St | PM | 15 | 46 | **64** | 89 |
| Hudson Pl & Hoboken Terminal | PM | 26 | 34 | **36** | 41 |
| Hamilton Park | AM | 14 | 19 | **21** | 25 |
| Hoboken Ave at Monmouth St | AM | 13 | 17 | **19** | 25 |
| Brunswick St | AM | 11 | 16 | **18** | 22 |

**Costo del nivel de servicio** — la tabla que justifica el proyecto:

| Ventana | p50 (cubre la mitad de los días) | p90 (cubre 9 de cada 10) | Costo |
|---|---|---|---|
| AM | 411 bicicletas en el sistema | 768 | **+87 %** |
| PM | 378 | 890 | **+136 %** |

**Hallazgos para el pitch, ya verificados:**

- **Grove St PATH acumula +14,414 bicicletas netas en las mañanas del año y pierde −11,696 en las
  tardes**: una oscilación de 26,110. Hamilton Park y Marin Light Rail hacen el patrón espejo. Ahí
  están los dos segmentos y sus dos acciones contrarias.
- **Oakland Ave despacha 1,807 bicicletas más de las que recibe cada año.** Como no se queda vacía
  para siempre, esas llegaron en camión: ≈ 5 al día. Es volumen de rebalanceo real deducido de los
  datos, y sirve de **ancla de validación**: si el modelo sugiere mover 50 diarias ahí, algo falla.
- El **33.07 %** de los viajes ocurre entre las 4 y las 8 pm.
- Entre los 4,027 viajes que nunca registraron destino, el **86 %** eran eléctricas, contra **64 %**
  en el sistema.
- **El largo de la ventana es una palanca operativa.** En Grove St PATH: una visita cubriendo
  14–20 h exige **97** bicicletas; tres visitas de 2 h bajan el pico a **50**, a cambio de 10 bicis
  más movidas al día. Triplicar visitas casi reduce a la mitad el inventario inmovilizado.

---

## 7. Contrato de salida para el dashboard

CSV con encabezados en inglés simple. **Solo la ventana de prueba (agosto y septiembre)** para que
el dashboard cargue rápido.

### 7.1 Archivos

**`stations.csv`** — una fila por `station_key`
```
station_key, station_ids, name, lat, lng, segment, segment_action,
total_departures_year, annual_net_imbalance, mae_am, mae_pm, coverage_am, coverage_pm, is_relocation
```

**`predictions_window.csv`** — **el entregable principal**, alimenta el mapa
```
station_key, date, window, mode, need_p50, need_p90, need_actual,
baseline_p50, baseline_p90, covered, departures_pred, rain
```
`mode ∈ {backtest, forecast}` (ver §7.4). En las filas `forecast`, `need_actual`, `covered` y
`baseline_*` van **vacíos**: no existe dato real contra qué comparar. El dashboard debe tratar el
vacío como "sin verificar", nunca como cero.

**`predictions_hourly.csv`** — detalle al hacer clic en una estación
```
station_key, datetime_hour, departures_actual, departures_pred,
departures_lo, departures_hi, net_flow_actual, net_flow_pred
```

**`metrics.csv`** — pestaña de calidad del modelo
```
model, fold, window, day_type, mae, rmse, pinball, coverage, total_bikes, n
```
Una fila por combinación, con `model ∈ {baseline, lightgbm}`. **Es la evidencia de la comparación.**

**`profiles.csv`** — mapa de calor
```
station_key, hour, day_of_week, avg_departures, avg_arrivals, avg_net
```

**`routes.csv`** — rutas más usadas (exigido explícitamente por la rúbrica)
```
start_station_key, end_station_key, trips, avg_duration_min
```
Solo entre las 114, top ~200.

**`weather_effect.csv`** — el "porqué". Generar **aunque el clima no entre al modelo**
```
station_key, window, avg_need_dry, avg_need_rain, pct_change, n_dry, n_rain
```

### 7.2 🔴 La trampa que mata la demo

> **`fetch()` sobre `file://` está bloqueado por CORS en Chrome.** Si el dashboard abre los CSV con
> `fetch` y se abre con doble clic, la pantalla queda en blanco.

**Solución:** emitir además un **`data.js`** con los contenidos como objetos JS
(`const PREDICTIONS = [...]; const STATIONS = [...];`) cargado con `<script src="data.js">`.
Funciona con doble clic, sin servidor. **Generarlo desde el pipeline**, no a mano.

**Tamaño:** `predictions_hourly` son ~108 estaciones × 61 días × 24 h ≈ **158,000 filas** (~12 MB).
Por eso va separado de `predictions_window` (~13,000 filas), que es lo que alimenta el mapa y debe
aparecer instantáneo.

### 7.3 Notas de límites que el dashboard debe mostrar fijas

1. La recomendación asume que la estación **empieza la ventana balanceada**; no hay dato de
   inventario real.
2. **La demanda está censurada:** si la estación se vació, los viajes que no ocurrieron no están en
   los datos. Las cifras son un **piso**, la necesidad real es igual o mayor.
3. **No se conoce la capacidad** de anclajes. Grove St PATH necesita 97 bicicletas, pero no sabemos
   si caben. Es el argumento más fuerte para GBFS como siguiente paso — no por el inventario, sino
   por la capacidad.
4. Las llegadas desde fuera de la zona no están en la fuente (menos del 1 % de los viajes).
5. Las métricas se midieron en **temporada alta** (agosto y septiembre).

### 7.4 Modo pronóstico — fechas futuras en el dashboard

El dashboard es **precargado, no en vivo**, y así debe quedarse: un tablero que consulta datos ya
resueltos no puede fallar durante la demo, que es donde están los 35 puntos.

Un dashboard verdaderamente en vivo **no es posible con esta fuente**: Citi Bike publica el
historial de viajes por mes y con retraso. El dato más reciente es el 30 de septiembre de 2026, así
que ya hay un hueco de días que no se puede llenar hasta que salga el archivo de octubre, y los
rezagos del modelo necesitan viajes recientes que todavía no existen.

**La opción intermedia sí sirve y es barata:** generar predicciones para **fechas futuras** (del 10
al 17 de octubre de 2026) usando los últimos rezagos conocidos más el **pronóstico real del clima**.
Sigue siendo precargado, pero el dashboard muestra fechas por venir en vez de meses pasados. Se ve
en vivo, no puede fallar, y es honesto.

**Cómo generarlo:**

1. Tomar el modelo ya entrenado del corte 2 (entrenamiento hasta el 31 de agosto). No reentrenar.
2. Construir la rejilla futura: `station_key × fecha(10–17 oct) × ventana`, solo con las estaciones
   activas al 30 de septiembre.
3. **Rezagos:** congelados al último valor conocido. `necesidad_media_4sem` y `salidas_media_4sem`
   se calculan sobre las últimas 4 semanas disponibles (septiembre), por ventana y día de la semana.
   `necesidad_hace_7d` no existe para fechas futuras: usar el mismo promedio de 4 semanas en su
   lugar y dejarlo documentado.
4. **Clima:** endpoint de **forecast** de Open-Meteo (`api.open-meteo.com/v1/forecast`), mismas
   coordenadas `40.72, -74.04`, mismo `timezone=America/New_York`, mismas variables horarias.
   Es un endpoint distinto al de archivo histórico de §3.
5. Calendario: día de la semana y festivos se calculan normalmente — son conocidos de antemano.
6. Predecir τ=0.5 y τ=0.9, escribir con `mode='forecast'`.

**Por qué es defendible:**

- Los rezagos quedarían a ~10 días de distancia, pero son promedios de 4 semanas por día de la
  semana, así que decaen lento. La estructura semanal aguanta.
- No se cruza un salto estacional: **octubre 2025 tuvo 104.2k viajes y septiembre 2026 tuvo 106.6k**,
  niveles casi idénticos. Predecir mediados de octubre desde finales de septiembre es interpolar,
  no extrapolar.

**Lo que hay que declarar en pantalla:** estas predicciones **no se pueden validar** — no hay dato
real contra qué compararlas. La afirmación de calidad del modelo se sostiene en el backtest de
agosto y septiembre, no en ellas.

> **Decisión de qué mostrar primero.** El modo pronóstico se ve más impresionante, pero el modo
> backtest **muestra las predicciones contra lo real lado a lado**, que es la única forma de que el
> jurado *vea* que el modelo acierta. Si solo da tiempo para uno, hacer backtest. Si dan los dos,
> poner un selector y **abrir en backtest**, con el pronóstico como segunda pestaña.

---

## 8. Orden de ejecución y línea de corte

Con el tiempo que queda, ejecutar en este orden y **cortar donde se acabe**:

| # | Paso | Imprescindible |
|---|---|---|
| 1 | Carga, limpieza, `station_key`, tabla de estaciones | **SÍ** |
| 2 | Panel horario con ventanas de actividad | **SÍ** |
| 3 | Panel de ventana con el objetivo `necesidad` | **SÍ** |
| 4 | **Baseline de cuantiles empíricos** | **SÍ — es el seguro** |
| 5 | LightGBM τ=0.5 y τ=0.9, sin clima | **SÍ** |
| 6 | Validación: 2 cortes, cobertura, ancho de intervalo | **SÍ** |
| 7 | Exportar los CSV + `data.js` | **SÍ** |
| 8 | Clima: Open-Meteo, reentrenar, comparar | Solo con 30 min limpios |
| 9 | `weather_effect.csv` (tabla simple, sin modelo) | Barato, hacerlo igual |
| 10 | Segmentos KMeans + acciones | Si sobra |
| 11 | **Modo pronóstico** (§7.4): fechas futuras + clima del forecast | Si sobra — barato, alto impacto visual |
| 12 | Modelo horario (`predictions_hourly`) | Si sobra |
| 13 | Tercer corte en febrero (temporada baja) | Si sobra |

**El paso 4 es el seguro:** si el LightGBM falla a las 2:30 am, el baseline con cuantiles ya
responde la pregunta del reto y es honesto presentarlo como tal.

**No hacer:** GBFS, Prophet, redes recurrentes, SHAP, 24 meses de historia, optimización de rutas de
camiones. Suenan bien y ninguno se sostiene con estos datos y este tiempo.

---

## 9. Validaciones anti-fuga antes de entregar

Tres revisiones manuales, cada una en una celda del notebook:

1. **Separación por fecha:** ninguna fila de prueba tiene fecha anterior al fin del entrenamiento.
2. **Rezagos:** calculados dentro de cada corte, nunca sobre el conjunto completo. Todos con ≥ 24 h
   de desfase.
3. **Sin variables del futuro:** no existe `mes`, ni ninguna variable que use información posterior
   a la predicción. El clima observado es la excepción consciente y está declarada.

Y una verificación de cordura: **si la cobertura de τ=0.9 da muy por encima del 90 %**, el modelo
está siendo conservador de más y está comprometiendo bicicletas de sobra; **si da muy por debajo**,
está dejando estaciones vacías. Ambos casos se arreglan recalibrando, no reentrenando.
