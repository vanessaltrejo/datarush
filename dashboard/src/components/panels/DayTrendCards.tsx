'use client'

import { useMemo } from 'react'
import { useDashboard } from '@/state/DashboardContext'
import { formatDateCompact, formatDateLong, formatInt, formatOneDecimal } from '@/lib/format'
import type { DailyPoint, WindowPrediction } from '@/types/domain'

interface MovementPoint {
  date: string,
  value: number,
}

// Real trips per day in past data. On forecast days there are no trips yet, so we use the
// expected departures in the two peak windows (the model's departures_pred, AM + PM).
function movementSeries(mode: string, daily: DailyPoint[], predictions: WindowPrediction[]): MovementPoint[] {
  if (mode === 'forecast') {
    const totals = new Map<string, number>()
    for (const row of predictions) {
      if (row.mode !== 'forecast') continue
      totals.set(row.date, (totals.get(row.date) ?? 0) + row.departuresPred)
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))
  }
  return daily.filter((row) => row.trips !== null).map((row) => ({ date: row.date, value: row.trips ?? 0 }))
}

// Small bars for the last 7 days up to the selected one. The selected day is the dark bar.
function Sparkline({ points, selected }: { points: MovementPoint[], selected: string }) {
  const max = Math.max(...points.map((point) => point.value), 1)
  return (
    <div className="flex h-12 items-end gap-1" aria-hidden="true">
      {points.map((point) => (
        <div
          key={point.date}
          title={`${formatDateCompact(point.date)}: ${formatInt(Math.round(point.value))}`}
          className={`w-3 rounded-t ${point.date === selected ? 'bg-brand-700' : 'bg-brand-100'}`}
          style={{ height: `${Math.max(6, (point.value / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export function DayTrendCards() {
  const { data, mode, date } = useDashboard()

  const series = useMemo(() => movementSeries(mode, data.daily, data.predictions), [mode, data.daily, data.predictions])
  const index = series.findIndex((point) => point.date === date)
  const today = index >= 0 ? series[index] : null
  const previous = index > 0 ? series[index - 1] : null
  const change = today && previous && previous.value > 0 ? (today.value - previous.value) / previous.value : null
  const lastWeek = index >= 0 ? series.slice(Math.max(0, index - 6), index + 1) : []
  const isForecast = mode === 'forecast'

  const weather = data.daily.find((row) => row.date === date) ?? null
  const rainy = weather !== null && weather.precipMm > 0.1

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-600">
          {isForecast ? 'Movimiento esperado en horas pico' : 'Movimiento de bicis'} · {formatDateCompact(date)}
        </div>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-bold tabular-nums text-slate-900">
              {today ? formatInt(Math.round(today.value)) : 'sin dato'}
              <span className="ml-2 text-base font-medium text-slate-500">{isForecast ? 'salidas esperadas' : 'viajes'}</span>
            </div>
            <div className="mt-1 text-sm text-slate-700">
              {change === null || previous === null ? (
                isForecast ? 'Primer día del pronóstico: no hay un día anterior para comparar.' : 'Sin día anterior para comparar.'
              ) : (
                <>
                  <span className={`font-semibold ${change >= 0 ? 'text-brand-800' : 'text-amber-800'}`}>
                    {change >= 0 ? '▲' : '▼'} {formatOneDecimal(Math.abs(change) * 100)}% {change >= 0 ? 'más' : 'menos'}
                  </span>
                  {' '}que el {formatDateCompact(previous.date)}
                </>
              )}
            </div>
          </div>
          {lastWeek.length > 1 && <Sparkline points={lastWeek} selected={date} />}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {isForecast
            ? 'Suma de las salidas que espera el modelo en la mañana (6–12 h) y la tarde (14–20 h).'
            : 'Viajes reales que salieron de las estaciones ese día. Barras: últimos 7 días.'}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-600">Clima · {formatDateCompact(date)}</div>
        {weather ? (
          <>
            <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
              {formatOneDecimal(weather.tempMean)} °C
              <span className="ml-2 text-base font-medium text-slate-500">promedio</span>
            </div>
            <div className="mt-1 text-sm text-slate-700">
              Mínima {formatOneDecimal(weather.tempMin)} °C · Máxima {formatOneDecimal(weather.tempMax)} °C ·{' '}
              <span className="font-semibold">{rainy ? `Lluvia: ${formatOneDecimal(weather.precipMm)} mm` : 'Sin lluvia'}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {weather.weatherSource === 'forecast'
                ? `Pronóstico de Open-Meteo para el ${formatDateLong(date)}: el mismo clima que usó el modelo.`
                : `Clima registrado (Open-Meteo) el ${formatDateLong(date)}.`}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Sin datos de clima para este día.</p>
        )}
      </section>
    </div>
  )
}
