import { balanceRoleAction, segmentActionLabel, segmentLabel } from '@/lib/labels'
import type { FlowTrend, Station } from '@/types/domain'

interface RoleGroup {
  key: string,
  members: Station[],
}

interface SegmentGroup {
  segment: string,
  action: string,
  count: number,
}

interface RoleActionsCardProps {
  roleGroups: RoleGroup[],
  segmentGroups: SegmentGroup[],
  totalStations: number,
}

const trendStyles: Record<FlowTrend, { text: string, box: string, arrow: string }> = {
  drains: { text: 'se vacía', box: 'bg-orange-50 text-orange-800 ring-orange-200', arrow: 'M12 5v14M6 13l6 6 6-6' },
  fills: { text: 'se llena', box: 'bg-brand-50 text-brand-800 ring-brand-100', arrow: 'M12 19V5M6 11l6-6 6 6' },
  flat: { text: 'estable', box: 'bg-slate-100 text-slate-600 ring-slate-200', arrow: 'M5 12h14M13 6l6 6-6 6' },
}

function TrendChip({ period, trend }: { period: string, trend: FlowTrend }) {
  const style = trendStyles[trend]
  return (
    <span className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold ring-1 ${style.box}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={style.arrow} />
      </svg>
      <span className="whitespace-nowrap">
        <span className="font-normal opacity-80">{period}:</span> {style.text}
      </span>
    </span>
  )
}

// What to do for each kind of station. One row per role, with a bar for its share of the system.
export function RoleActionsCard({ roleGroups, segmentGroups, totalStations }: RoleActionsCardProps) {
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Tipo de estación: una acción distinta para cada rol</h3>
      <p className="mt-0.5 text-sm text-slate-500">
        Según el flujo neto de bicis en un día entre semana (promedio de todo el año). Si gana más de 3 bicis, se llena.
        Si pierde más de 3, se vacía.
      </p>

      <div className="mt-4 flex flex-1 flex-col">
        {roleGroups.map((group) => {
          const role = group.members[0].balanceRole
          const example = [...group.members].sort((a, b) => b.totalDeparturesYear - a.totalDeparturesYear)[0]
          const share = group.members.length / totalStations
          return (
            <div key={group.key} className="flex-1 border-t border-slate-100 py-3">
              <div className="grid h-full grid-cols-[minmax(150px,auto)_minmax(0,1fr)_72px] items-center gap-4">
                <div className="flex flex-col gap-1.5">
                  <TrendChip period="Mañana" trend={role.am} />
                  <TrendChip period="Tarde" trend={role.pm} />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-snug text-slate-900">{balanceRoleAction(role)}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">Ejemplo: {example.name}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-brand-700" style={{ width: `${Math.max(2, share * 100)}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums text-slate-900">{group.members.length}</div>
                  <div className="text-xs text-slate-500">estaciones</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-2 border-t border-slate-100 pt-4">
        <h4 className="font-semibold text-slate-900">Segmentos del modelo</h4>
        <p className="text-xs text-slate-500">Grupos por la forma de su día de 24 horas (KMeans).</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {segmentGroups.map((group) => (
            <div key={group.segment} className="rounded-xl bg-slate-50 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{segmentLabel(group.segment)}</span>
                <span className="text-sm font-bold tabular-nums text-brand-800">{group.count}</span>
              </div>
              <p className="text-xs leading-snug text-slate-600">{segmentActionLabel(group.action)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
