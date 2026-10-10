'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '@/state/DashboardContext'
import { loadStationHourly } from '@/services/dataService'
import { Badge, Note, Stat } from '@/components/layout/ui'
import { NeedSeriesChart } from '@/components/charts/NeedSeriesChart'
import { HourlyDayChart, TypicalDayChart } from '@/components/charts/HourlyChart'
import { dayOfWeekMonday, formatDateLong, formatInt, formatOneDecimal, formatPercent, formatSigned, formatSignedPercent } from '@/lib/format'
import {
  balanceRoleAction, balanceRoleLabel, segmentActionLabel, segmentLabel, statusLabels, weekdayShort, windowLabels,
} from '@/lib/labels'
import { stationSeries, typicalDay } from '@/lib/selectors'
import type { HourlyPoint } from '@/types/domain'

type HourlyState =
  | { status: 'loading', stationKey: string }
  | { status: 'ready', stationKey: string, points: HourlyPoint[] }
  | { status: 'error', stationKey: string, message: string }

function useStationHourly(stationKey: string, enabled: boolean): HourlyState | null {
  const [state, setState] = useState<HourlyState | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    loadStationHourly(stationKey)
      .then((points) => { if (!cancelled) setState({ status: 'ready', stationKey, points }) })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', stationKey, message: error instanceof Error ? error.message : 'Error' })
        }
      })
    return () => { cancelled = true }
  }, [stationKey, enabled])
  if (!enabled) return null
  if (!state || state.stationKey !== stationKey) return { status: 'loading', stationKey }
  return state
}

export function StationPanel({ stationKey }: { stationKey: string }) {
  const { data, mode, date, window, closeDetail } = useDashboard()
  const station = data.stations.find((item) => item.stationKey === stationKey)
  const hourlyEnabled = mode === 'backtest' && station?.status === 'active'
  const hourly = useStationHourly(stationKey, hourlyEnabled)

  const series = useMemo(
    () => stationSeries(data.predictions, stationKey, mode, window),
    [data.predictions, stationKey, mode, window],
  )
  const dayRow = series.find((row) => row.date === date)
  const weather = data.weatherEffects.find((row) => row.stationKey === stationKey && row.window === window)
  const weekday = dayOfWeekMonday(date)
  const dayPoints = hourly?.status === 'ready'
    ? hourly.points.filter((point) => point.datetimeHour.startsWith(date)).sort((a, b) => a.datetimeHour.localeCompare(b.datetimeHour))
    : []

  if (!station) return null
  const totalTrips = station.memberTrips + station.casualTrips
  const statusTone = station.status === 'active' ? 'default' : station.status === 'new' ? 'warn' : 'muted'

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-900">{station.name}</h2>
            <Badge tone={statusTone}>{statusLabels[station.status]}</Badge>
            {station.isRelocation && <Badge tone="muted">Reubicada: {station.stationIds.join(' + ')}</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {station.stationKey}. {formatInt(station.totalDeparturesYear)} salidas en el año (oct 2025 a sep 2026).
            {totalTrips > 0 && ` ${formatPercent(station.memberTrips / totalTrips, 0)} de miembros.`}
          </p>
        </div>
        <button
          type="button"
          onClick={closeDetail}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Cerrar (Esc)
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Segmento del modelo</div>
          <div className="mt-1 font-semibold text-slate-900">{segmentLabel(station.segment)}</div>
          <div className="text-sm text-slate-700">{segmentActionLabel(station.segmentAction)}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rol de balance (días entre semana)</div>
          <div className="mt-1 font-semibold text-slate-900">{balanceRoleLabel(station.balanceRole)}</div>
          <div className="text-sm text-slate-700">{balanceRoleAction(station.balanceRole)}</div>
          <div className="mt-1 text-xs text-slate-500">
            Flujo neto promedio: mañana {formatSigned(station.amNetWeekday)}, tarde {formatSigned(station.pmNetWeekday)} bicis.
            Es una tendencia del pasado, no una predicción.
          </div>
        </div>
      </div>

      {station.status === 'inactive' ? (
        <div className="mt-4"><Note>Esta estación no tuvo actividad de julio a septiembre. No hay pronóstico ni error.</Note></div>
      ) : (
        <>
          <h3 className="mt-6 text-lg font-semibold text-slate-900">
            {formatDateLong(date)}. {windowLabels[window]}
          </h3>
          {dayRow ? (
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="Día típico (p50)" value={formatOneDecimal(dayRow.needP50)} hint="bicis" />
              <Stat label="Recomendado (p90)" value={formatOneDecimal(dayRow.needP90)} hint="bicis recomendadas" tone="accent" />
              <Stat label="Real" value={mode === 'backtest' ? formatInt(dayRow.needActual) : 'sin verificar'} tone={mode === 'backtest' ? 'default' : 'muted'} />
              <Stat label="Línea base (p90)" value={mode === 'backtest' ? formatOneDecimal(dayRow.baselineP90) : 'sin dato'} tone="muted" />
              <Stat
                label="¿Alcanzó la recomendación?"
                value={dayRow.covered === null ? 'sin verificar' : dayRow.covered ? 'Sí' : 'No'}
                hint={dayRow.rain ? 'Ventana con lluvia' : 'Ventana sin lluvia'}
                tone={dayRow.covered === false ? 'accent' : 'default'}
              />
            </div>
          ) : (
            <div className="mt-3"><Note>Sin actividad registrada en esta ventana este día.</Note></div>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div>
              <h4 className="font-semibold text-slate-900">Necesidad por día e incertidumbre</h4>
              <p className="text-sm text-slate-500">
                {mode === 'backtest' ? 'Validación, 1 jul a 30 sep 2026.' : 'Pronóstico, 10 a 17 oct 2026.'} La banda va del día típico (p50) a lo recomendado (p90).
                {mode === 'backtest' && ' Los puntos naranjas son días donde lo real pasó lo recomendado.'}
              </p>
              {series.length > 0 ? <NeedSeriesChart series={series} mode={mode} selectedDate={date} /> : <Note>Sin datos para esta ventana.</Note>}
              {station.status === 'new' && <Note>Estación nueva (abrió el 30 ago 2026). Solo tiene pronóstico, sin validación.</Note>}
            </div>

            <div>
              {mode === 'backtest' ? (
                <>
                  <h4 className="font-semibold text-slate-900">Salidas por hora del día elegido</h4>
                  <p className="text-sm text-slate-500">
                    Barras: salidas reales. Línea: promedio de esa hora en los meses de entrenamiento (oct 2025 al mes anterior),
                    incluye invierno, por eso suele quedar abajo en verano. Es un promedio, no un pronóstico.
                  </p>
                  {hourly?.status === 'ready' && dayPoints.length > 0 && <HourlyDayChart points={dayPoints} />}
                  {hourly?.status === 'ready' && dayPoints.length === 0 && <Note>Sin datos por hora para este día.</Note>}
                  {hourly?.status === 'loading' && <p className="py-10 text-center text-slate-500">Cargando...</p>}
                  {hourly?.status === 'error' && <Note>No se pudo cargar el detalle por hora.</Note>}
                  {!hourlyEnabled && <Note>Sin detalle por hora para esta estación.</Note>}
                </>
              ) : (
                <>
                  <h4 className="font-semibold text-slate-900">Día típico de {weekdayShort[weekday]}: no es un pronóstico</h4>
                  <p className="text-sm text-slate-500">Promedio por hora de todo el año (oct 2025 a sep 2026). No hay datos por hora para fechas futuras.</p>
                  <TypicalDayChart profile={typicalDay(data.profiles, stationKey, weekday)} />
                </>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="font-semibold text-slate-900">Error de esta estación</h4>
              <p className="text-sm text-slate-500">Validación jul, ago y sep 2026. MAE del día típico. Cobertura de lo recomendado (p90).</p>
              <table className="mt-2 w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Ventana</th><th>MAE (bicis)</th><th>Cobertura</th></tr></thead>
                <tbody className="tabular-nums">
                  <tr><td className="py-1">Mañana</td><td>{formatOneDecimal(station.maeAm)}</td><td>{formatPercent(station.coverageAm, 0)}</td></tr>
                  <tr><td className="py-1">Tarde</td><td>{formatOneDecimal(station.maePm)}</td><td>{formatPercent(station.coveragePm, 0)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="font-semibold text-slate-900">Efecto de la lluvia ({window === 'AM' ? 'mañana' : 'tarde'})</h4>
              <p className="text-sm text-slate-500">Necesidad promedio con y sin lluvia, todo el año.</p>
              {weather ? (
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-2xl font-bold tabular-nums">{formatOneDecimal(weather.avgNeedDry)}</div><div className="text-xs text-slate-500">sin lluvia ({weather.nDry} días)</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{formatOneDecimal(weather.avgNeedRain)}</div><div className="text-xs text-slate-500">con lluvia ({weather.nRain} días)</div></div>
                  <div><div className="text-2xl font-bold tabular-nums">{formatSignedPercent(weather.pctChange)}</div><div className="text-xs text-slate-500">cambio</div></div>
                </div>
              ) : <Note>Sin datos de clima para esta estación y ventana.</Note>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
