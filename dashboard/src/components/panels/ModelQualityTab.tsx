'use client'

import { useMemo, useState } from 'react'
import { useDashboard } from '@/state/DashboardContext'
import { Card, Note, SegmentedControl } from '@/components/layout/ui'
import { formatInt, formatPercent } from '@/lib/format'
import { foldLabel, modelLabels } from '@/lib/labels'
import { equalCoverage } from '@/lib/selectors'

type Slice = 'all|all' | 'AM|weekday' | 'AM|weekend' | 'PM|weekday' | 'PM|weekend'

// metrics.csv only has these five window and day type combinations.
const sliceOptions: { value: Slice, label: string }[] = [
  { value: 'all|all', label: 'Todo' },
  { value: 'AM|weekday', label: 'Mañana, entre semana' },
  { value: 'AM|weekend', label: 'Mañana, fin de semana' },
  { value: 'PM|weekday', label: 'Tarde, entre semana' },
  { value: 'PM|weekend', label: 'Tarde, fin de semana' },
]

const mainModels = ['baseline', 'lightgbm', 'lightgbm_weather']

export function ModelQualityTab() {
  const { data } = useDashboard()
  const [slice, setSlice] = useState<Slice>('all|all')
  const [window, dayType] = slice.split('|')

  const rows = data.metrics
    .filter((row) => mainModels.includes(row.model) && row.window === window && row.dayType === dayType)
    .sort((a, b) => a.fold.localeCompare(b.fold) || mainModels.indexOf(a.model) - mainModels.indexOf(b.model))
  const hb107 = data.metrics.filter((row) => row.model === 'lightgbm_weather_HB107' && row.window === 'PM' && row.dayType === 'weekday')[0]

  const fairComparison = useMemo(
    () => ['2026-07', '2026-08', '2026-09'].map((month) => equalCoverage(data.predictions, month)),
    [data.predictions],
  )

  const cleaningLabels: Record<string, string> = {
    rule1_no_start_id: 'Sin estación de origen (descartados)',
    rule2_dup_ride_id: 'Viajes duplicados (descartados)',
    rule3_bad_duration: 'Duración negativa (descartados)',
    rule4_recovered_end_id: 'Destino recuperado por nombre',
    rule5_no_dest: 'Sin destino (cuentan solo como salida)',
    rule6_arrival_over_24h: 'Más de 24 horas (no cuentan como llegada)',
    rule7_arrival_outside_114: 'Destino fuera de las 114 estaciones (no cuentan como llegada)',
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Comparación de modelos" subtitle="Validación mes a mes, de diciembre 2025 a septiembre 2026: cada mes se predice con un modelo entrenado solo con los meses anteriores. El pronóstico se entrena con todo hasta septiembre.">
        <SegmentedControl<Slice> label="Ventana y tipo de día" value={slice} onChange={setSlice} options={sliceOptions} />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Mes de prueba</th><th>Modelo</th>
                <th className="text-right">MAE (bicis)</th><th className="text-right">RMSE</th><th className="text-right">Pinball p90</th>
                <th className="text-right">Cobertura p90</th><th className="text-right">Bicis comprometidas</th><th className="text-right">Casos</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((row) => (
                <tr key={`${row.fold}-${row.model}`} className={`border-t border-slate-100 ${row.model === 'lightgbm_weather' ? 'bg-brand-50 font-semibold' : ''}`}>
                  <td className="py-2">{foldLabel(row.fold)}</td>
                  <td>{modelLabels[row.model] ?? row.model}</td>
                  <td className="text-right">{row.mae.toFixed(2)}</td>
                  <td className="text-right">{row.rmse.toFixed(2)}</td>
                  <td className="text-right">{row.pinball.toFixed(3)}</td>
                  <td className="text-right">{formatPercent(row.coverage)}</td>
                  <td className="text-right">{formatInt(row.totalBikes)}</td>
                  <td className="text-right">{formatInt(row.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          No usamos MAPE: muchas estaciones tienen necesidad cero y el MAPE se dispara cerca de cero.
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Comparación justa: misma cobertura" subtitle="Calculado en el dashboard con predictions_window.csv">
          <p className="text-sm text-slate-700">
            Las bicis comprometidas de la tabla no se miden a la misma cobertura. Aquí subimos la línea base con una
            constante hasta que cubra tantos días como LightGBM + clima. Luego comparamos cuántas bicis pide cada uno.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1.5">Mes</th><th className="text-right">Cobertura</th><th className="text-right">LightGBM + clima</th><th className="text-right">Línea base ajustada</th><th className="text-right">Extra de la línea base</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {fairComparison.map((result) => result && (
                <tr key={result.month} className="border-t border-slate-100">
                  <td className="py-1.5">{({ '2026-07': 'Julio', '2026-08': 'Agosto', '2026-09': 'Septiembre' } as Record<string, string>)[result.month] ?? result.month}</td>
                  <td className="text-right">{formatPercent(result.modelCoverage)}</td>
                  <td className="text-right font-semibold">{formatInt(result.modelBikes)}</td>
                  <td className="text-right">{formatInt(result.baselineBikes)} <span className="block text-xs text-slate-500">+{result.baselineShift.toFixed(2)} por fila, cubre {formatPercent(result.baselineCoverage)}</span></td>
                  <td className="text-right font-semibold text-brand-800">{result.baselineBikes >= result.modelBikes ? '+' : ''}{formatPercent(result.baselineBikes / result.modelBikes - 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-slate-700">
            En agosto y septiembre, con la misma protección, el modelo pide menos bicis. Ese es el ahorro para el operador.
            En julio la línea base ya cubre más sin ajuste y pide un poco menos. La línea base sube en
            pasos de 0.01 y se toma el primer paso que iguala o pasa la cobertura del modelo.
          </p>
        </Card>

        <Card title="Cómo leer estos números">
          <ul className="space-y-2 text-sm text-slate-700">
            <li><b>Típico (p50):</b> la mitad de los días se necesita menos que esto.</li>
            <li><b>Seguro (p90):</b> 9 de cada 10 días se necesita menos que esto. Es el nivel recomendado.</li>
            <li><b>Cobertura:</b> % de días donde la necesidad real quedó en o debajo del nivel seguro. La meta es cerca de 90%.</li>
            <li><b>Bicis comprometidas:</b> suma del nivel seguro en todo el sistema. Menos es mejor, si la cobertura es igual.</li>
            <li><b>Por qué el MAE no basta:</b> mide el error del nivel típico. Al operador le importa cuántas bicis aparta para no quedarse vacío.</li>
            <li>El rango típico a seguro no es simétrico. Va del nivel típico al nivel seguro.</li>
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Cómo funciona" subtitle="Del dato crudo a la recomendación">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              Se cargan {formatInt(data.cleaning.rawTrips)} viajes de 12 archivos (oct 2025 a sep 2026) y se limpian:
              <ul className="mt-1 list-disc pl-5">
                {data.cleaning.steps.map((step) => (
                  <li key={step.rule}>{cleaningLabels[step.rule] ?? step.rule}: {formatInt(step.rows)}</li>
                ))}
              </ul>
            </li>
            <li>Tres estaciones reubicadas se unen con su estación anterior (114 estaciones pasan a 111 claves).</li>
            <li>
              Para cada estación, día y ventana se calcula la necesidad: el peor punto del acumulado de llegadas menos salidas.
              <code className="mt-1 block rounded bg-slate-100 px-2 py-1 text-xs">necesidad = máx(0, −mín acumulado(llegadas − salidas))</code>
            </li>
            <li>Línea base: cuantiles p50 y p90 de las últimas 8 semanas por estación, ventana y tipo de día.</li>
            <li>LightGBM: un modelo global de cuantiles (p50 y p90) con estación, día, festivo, rezagos y clima (Open-Meteo). El p90 se recalibra para cubrir cerca de 90%.</li>
            <li>Validación temporal mes a mes (diciembre a septiembre), sin mezclar fechas. El pronóstico final se entrena con todos los meses validados. El total del sistema es la suma de los niveles típicos por un factor aprendido de las 12 semanas anteriores. Ningún dato del futuro: todos los rezagos tienen al menos 24 horas y no hay variable de mes.</li>
          </ol>
        </Card>
        <Card title="Nota: Hudson Pl & Hoboken Terminal (HB107)">
          <p className="text-sm text-slate-700">
            Esta estación se mudó 116 m desde River St & Newark St (HB106) a fines de julio. Su desbalance bajó cerca de 70% después de la mudanza.
            Por eso en agosto, en las tardes entre semana, el error es alto
            {hb107 ? ` (MAE de ${hb107.mae.toFixed(1)} bicis)` : ''}. Se reporta aparte para no esconderlo.
          </p>
          <div className="mt-3">
            <Note>
              Las estaciones muy pequeñas (menos de 2,000 viajes al año) tienen un MAE un poco peor con LightGBM que con la línea base.
              En las estaciones grandes LightGBM es mejor. Las métricas solo describen temporada alta.
            </Note>
          </div>
        </Card>
      </div>
    </div>
  )
}
