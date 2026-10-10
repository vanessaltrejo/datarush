import { formatDateLong, formatInt } from '@/lib/format'
import type { SystemTotals } from '@/lib/selectors'
import type { DashboardMode, NeedLevel, WindowName } from '@/types/domain'

interface NeedHeadlineProps {
  mode: DashboardMode,
  date: string,
  window: WindowName,
  level: NeedLevel,
  totals: SystemTotals,
  topName: string | null,
  topValue: number | null,
}

// One plain sentence that says what the numbers mean for the selected day. Built only from the data.
export function NeedHeadline({ mode, date, window, level, totals, topName, topValue }: NeedHeadlineProps) {
  const when = window === 'AM' ? 'la mañana' : 'la tarde'
  const hour = window === 'AM' ? '6:00' : '14:00'
  const total = level === 'p90' ? totals.safe : totals.typical
  const coverage = level === 'p90' ? 'para cubrir 9 de cada 10 días' : 'en un día típico (cubre la mitad de los días)'

  return (
    <div className="rounded-2xl border border-brand-100 border-l-4 border-l-brand-700 bg-brand-50 px-5 py-3 text-[17px] leading-snug text-slate-800">
      Para <strong>{when}</strong> del {formatDateLong(date)} (desde las {hour}), el sistema necesita{' '}
      <strong className="text-brand-800">{formatInt(total)} bicis</strong> {coverage}.
      {topName !== null && topValue !== null && (
        <>
          {' '}La estación que más necesita es <strong>{topName}</strong>, con{' '}
          <strong className="text-brand-800">{formatInt(topValue)}</strong>.
        </>
      )}
      {mode === 'backtest' && totals.actual !== null && (
        <>
          {' '}Ese día se necesitaron de verdad <strong>{formatInt(totals.actual)}</strong>.
        </>
      )}
    </div>
  )
}
