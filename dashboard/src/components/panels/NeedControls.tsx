'use client'

import type { ReactNode } from 'react'
import { useDashboard } from '@/state/DashboardContext'
import { formatDateCompact } from '@/lib/format'
import { modeLabels } from '@/lib/labels'
import type { BacktestView, DashboardMode, NeedLevel, WindowName } from '@/types/domain'

function Dropdown({ label, hint, children }: { label: string, hint?: string, children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

const selectClass = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-400'

// The map controls, one dropdown each, in a card beside the map.
export function NeedControls() {
  const {
    mode, modeChosen, setMode, date, setDate, availableDates, window, setWindow, level, setLevel, backtestView, setBacktestView,
  } = useDashboard()

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Controles</h3>

      <Dropdown
        label="Modo"
        hint={!modeChosen ? 'Elige un modo para ver las bicis necesarias en el mapa.'
          : mode === 'backtest' ? 'Compara lo que el modelo predijo con lo que de verdad pasó.'
            : 'Predicción para fechas futuras. No hay datos reales para comparar.'}
      >
        <select
          value={modeChosen ? mode : ''}
          onChange={(event) => setMode(event.target.value as DashboardMode)}
          className={`${selectClass} ${!modeChosen ? 'ring-2 ring-brand-700' : ''}`}
        >
          {!modeChosen && <option value="" disabled>Elige un modo</option>}
          <option value="backtest">{modeLabels.backtest}</option>
          <option value="forecast">{modeLabels.forecast}</option>
        </select>
      </Dropdown>

      <Dropdown label="Día">
        <select value={date} onChange={(event) => setDate(event.target.value)} className={selectClass}>
          {availableDates.map((option) => (
            <option key={option} value={option}>{formatDateCompact(option)}</option>
          ))}
        </select>
      </Dropdown>

      <Dropdown label="Horario">
        <select value={window} onChange={(event) => setWindow(event.target.value as WindowName)} className={selectClass}>
          <option value="AM">Mañana 6–12 h</option>
          <option value="PM">Tarde 14–20 h</option>
        </select>
      </Dropdown>

      <Dropdown
        label="Protección"
        hint={level === 'p90' ? 'La recomendación alcanza 9 de cada 10 días.' : 'La recomendación alcanza la mitad de los días.'}
      >
        <select value={level} onChange={(event) => setLevel(event.target.value as NeedLevel)} className={selectClass}>
          <option value="p90">Alta (p90)</option>
          <option value="p50">Media (p50)</option>
        </select>
      </Dropdown>

      <Dropdown label="Mostrar en el mapa" hint={mode === 'forecast' ? 'Solo en datos pasados.' : undefined}>
        <select
          value={backtestView}
          onChange={(event) => setBacktestView(event.target.value as BacktestView)}
          disabled={!modeChosen || mode !== 'backtest'}
          className={selectClass}
        >
          <option value="predicted">Predicho</option>
          <option value="actual">Real</option>
          <option value="difference">Diferencia</option>
        </select>
      </Dropdown>
    </section>
  )
}
