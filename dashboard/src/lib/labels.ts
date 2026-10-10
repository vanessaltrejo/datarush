import type { BalanceRole, DashboardMode, FlowTrend, StationStatus, WindowName } from '@/types/domain'

// All UI text lives here or in the components. The UI is in Spanish (challenge language).

export const windowLabels: Record<WindowName, string> = {
  AM: 'Mañana (6:00 a 11:59)',
  PM: 'Tarde (14:00 a 19:59)',
}

export const modeLabels: Record<DashboardMode, string> = {
  backtest: 'Datos pasados (1 jul a 30 sep)',
  forecast: 'Próximos días (10 a 17 oct)',
}

export const statusLabels: Record<StationStatus, string> = {
  active: 'Activa',
  new: 'Estación nueva, sin validación',
  inactive: 'Sin actividad reciente',
}

const trendLabels: Record<FlowTrend, string> = {
  fills: 'se llena',
  drains: 'se vacía',
  flat: 'estable',
}

export function balanceRoleLabel(role: BalanceRole): string {
  return `Mañana: ${trendLabels[role.am]}. Tarde: ${trendLabels[role.pm]}.`
}

// Suggested actions per balance role (brief section 6, translated).
export function balanceRoleAction(role: BalanceRole): string {
  const key = `${role.am}_${role.pm}`
  const actions: Record<string, string> = {
    drains_fills: 'Reabastecer antes de la mañana. Recoger bicis extra en la tarde.',
    fills_drains: 'Recoger bicis en la mañana, la estación puede llenarse. Reabastecer fuerte antes de la tarde.',
    drains_flat: 'Reabastecer solo antes de la mañana.',
    fills_flat: 'Vigilar que no se llene en la mañana. Necesidad baja.',
    flat_drains: 'Reabastecer antes de la tarde.',
    flat_flat: 'Prioridad baja. Monitorear.',
  }
  return actions[key] ?? 'Monitorear.'
}

export const balanceRoleOrder = ['drains_fills', 'fills_drains', 'drains_flat', 'fills_flat', 'flat_drains', 'flat_flat']

export function balanceRoleKey(role: BalanceRole): string {
  return `${role.am}_${role.pm}`
}

// Segment names come from the model (KMeans). We translate the text, not the grouping.
export function segmentLabel(segment: string): string {
  const match = /^(Morning|Evening)-peak \(h(\d+)\)$/.exec(segment)
  if (!match) return segment
  const period = match[1] === 'Morning' ? 'Pico de mañana' : 'Pico de tarde'
  return `${period} (${match[2]}:00)`
}

export function segmentActionLabel(action: string): string {
  const actions: Record<string, string> = {
    'Fill before AM; expect drain by late morning': 'Llenar antes de la mañana. Se espera que se vacíe a media mañana.',
    'Fill before PM; expect drain by evening': 'Llenar antes de la tarde. Se espera que se vacíe al anochecer.',
  }
  return actions[action] ?? action
}

export const weekdayShort = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export const modelLabels: Record<string, string> = {
  baseline: 'Línea base (cuantiles de 8 semanas)',
  lightgbm: 'LightGBM',
  lightgbm_weather: 'LightGBM + clima (modelo usado)',
}

const monthLabels = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Folds are named by their test month, like '2026-07'.
export function foldLabel(fold: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(fold)
  return match ? `${monthLabels[Number(match[2]) - 1]} ${match[1]}` : fold
}
