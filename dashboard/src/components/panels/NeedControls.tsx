'use client'

import { useDashboard } from '@/state/DashboardContext'
import { SegmentedControl } from '@/components/layout/ui'
import { formatDateCompact } from '@/lib/format'
import { modeLabels } from '@/lib/labels'
import type { BacktestView, DashboardMode, NeedLevel, WindowName } from '@/types/domain'

export function NeedControls() {
  const {
    mode, setMode, date, setDate, availableDates, window, setWindow, level, setLevel, backtestView, setBacktestView,
  } = useDashboard()

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <SegmentedControl<DashboardMode>
        label="Modo"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'backtest', label: modeLabels.backtest },
          { value: 'forecast', label: modeLabels.forecast },
        ]}
      />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Día</span>
        <select
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-800"
        >
          {availableDates.map((option) => (
            <option key={option} value={option}>{formatDateCompact(option)}</option>
          ))}
        </select>
      </label>
      <SegmentedControl<WindowName>
        label="Ventana"
        value={window}
        onChange={setWindow}
        options={[{ value: 'AM', label: 'Mañana 6–12 h' }, { value: 'PM', label: 'Tarde 14–20 h' }]}
      />
      <SegmentedControl<NeedLevel>
        label="Nivel"
        value={level}
        onChange={setLevel}
        options={[{ value: 'p90', label: 'Seguro (p90)' }, { value: 'p50', label: 'Típico (p50)' }]}
      />
      {mode === 'backtest' && (
        <SegmentedControl<BacktestView>
          label="Mostrar en el mapa"
          value={backtestView}
          onChange={setBacktestView}
          options={[
            { value: 'predicted', label: 'Predicho' },
            { value: 'actual', label: 'Real' },
            { value: 'difference', label: 'Diferencia' },
          ]}
        />
      )}
    </div>
  )
}
