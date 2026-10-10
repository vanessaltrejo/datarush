'use client'

import { useDashboard } from '@/state/DashboardContext'
import { Badge } from '@/components/layout/ui'
import { formatInt, formatOneDecimal } from '@/lib/format'
import { balanceRoleLabel, segmentLabel, statusLabels } from '@/lib/labels'
import type { WindowPrediction } from '@/types/domain'

function verdict(row: WindowPrediction, hour: string, level: 'p50' | 'p90', isBacktest: boolean): string[] {
  const lines: string[] = []
  if (level === 'p90') {
    lines.push(`Debe tener ${formatOneDecimal(row.needP90)} bicis a las ${hour}. Con eso alcanza 9 de cada 10 días.`)
  } else {
    lines.push(`En un día típico necesita ${formatOneDecimal(row.needP50)} bicis a las ${hour}.`)
  }
  if (isBacktest && row.needActual !== null) {
    lines.push(
      `Ese día se necesitaron ${formatInt(row.needActual)}: ${row.covered ? 'la recomendación alcanzó.' : 'la recomendación se quedó corta.'}`,
    )
  }
  return lines
}

// The station in focus. It is chosen from the start, so the first screen already tells a story.
export function StationFocusCard() {
  const { data, mode, date, window, level, selectedStationKey, openDetail, availableDates } = useDashboard()
  const station = data.stations.find((item) => item.stationKey === selectedStationKey)
  if (!station) return null

  const row = data.predictions.find((item) => item.stationKey === station.stationKey
    && item.mode === mode && item.date === date && item.window === window)
  const hour = window === 'AM' ? '6:00' : '14:00'
  const isBacktest = mode === 'backtest'
  const hasDay = availableDates.includes(date)

  return (
    <section className="rounded-2xl border border-brand-700/30 bg-white p-5 shadow-sm ring-1 ring-brand-100">
      <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">Estación en foco</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h3 className="text-xl font-bold text-slate-900">{station.name}</h3>
        {station.status !== 'active' && <Badge tone={station.status === 'new' ? 'warn' : 'muted'}>{statusLabels[station.status]}</Badge>}
      </div>
      <p className="mt-0.5 text-sm text-slate-600">
        {segmentLabel(station.segment)}. {balanceRoleLabel(station.balanceRole)}
      </p>

      {row && hasDay ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              <div className="text-2xl font-bold tabular-nums text-slate-900">{formatOneDecimal(row.needP50)}</div>
              <div className="text-xs text-slate-500">día típico</div>
            </div>
            <div className="rounded-lg bg-brand-50 px-2 py-2">
              <div className="text-2xl font-bold tabular-nums text-brand-800">{formatOneDecimal(row.needP90)}</div>
              <div className="text-xs text-slate-600">recomendado</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              <div className="text-2xl font-bold tabular-nums text-slate-900">
                {isBacktest ? formatInt(row.needActual) : '—'}
              </div>
              <div className="text-xs text-slate-500">{isBacktest ? 'real' : 'sin verificar'}</div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-[15px] text-slate-800">
            {verdict(row, hour, level, isBacktest).map((line) => <p key={line}>{line}</p>)}
          </div>
        </>
      ) : (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Sin actividad registrada para esta estación en este día y horario.
        </p>
      )}

      <button
        type="button"
        onClick={openDetail}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-base font-semibold text-white transition hover:bg-brand-800"
      >
        Ver detalle e incertidumbre
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
      <p className="mt-2 text-center text-sm font-semibold text-brand-800">
        Haz clic en otra estación del mapa o del top 10 para cambiarla.
      </p>
    </section>
  )
}
