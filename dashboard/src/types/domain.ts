export type WindowName = 'AM' | 'PM'
export type DashboardMode = 'backtest' | 'forecast'
export type NeedLevel = 'p50' | 'p90'
export type BacktestView = 'predicted' | 'actual' | 'difference'
export type StationStatus = 'active' | 'new' | 'inactive'
export type FlowTrend = 'fills' | 'drains' | 'flat'

export interface BalanceRole {
  am: FlowTrend,
  pm: FlowTrend,
}

export interface Station {
  stationKey: string,
  stationIds: string[],
  name: string,
  lat: number,
  lng: number,
  segment: string,
  segmentAction: string,
  totalDeparturesYear: number,
  annualNetImbalance: number,
  maeAm: number | null,
  maePm: number | null,
  coverageAm: number | null,
  coveragePm: number | null,
  isRelocation: boolean,
  status: StationStatus,
  amNetWeekday: number,
  pmNetWeekday: number,
  balanceRole: BalanceRole,
  memberTrips: number,
  casualTrips: number,
}

export interface WindowPrediction {
  stationKey: string,
  date: string,
  window: WindowName,
  mode: DashboardMode,
  needP50: number,
  needP90: number,
  needActual: number | null,
  baselineP50: number | null,
  baselineP90: number | null,
  covered: boolean | null,
  departuresPred: number,
  rain: boolean,
}

export interface HourlyPoint {
  stationKey: string,
  datetimeHour: string,
  departuresActual: number,
  departuresPred: number,
  departuresLo: number,
  departuresHi: number,
  netFlowActual: number,
  netFlowPred: number,
}

export interface MetricRow {
  model: string,
  fold: string,
  window: string,
  dayType: string,
  mae: number,
  rmse: number,
  pinball: number,
  coverage: number,
  totalBikes: number,
  n: number,
}

export interface Route {
  startStationKey: string,
  endStationKey: string,
  trips: number,
  avgDurationMin: number,
}

export interface ProfileRow {
  stationKey: string,
  hour: number,
  dayOfWeek: number,
  avgDepartures: number,
  avgArrivals: number,
  avgNet: number,
}

export interface WeatherEffect {
  stationKey: string,
  window: WindowName,
  avgNeedDry: number,
  avgNeedRain: number,
  pctChange: number | null,
  nDry: number,
  nRain: number,
}

export interface UserTypeHour {
  hour: number,
  member: number,
  casual: number,
}

export interface UserTypeSummary {
  byHour: UserTypeHour[],
  totalTrips: number,
}

export interface CleaningSummary {
  rawTrips: number,
  steps: { rule: string, rows: number }[],
}

// One calendar day: real trips (null on forecast days) and the day's weather.
export interface DailyPoint {
  date: string,
  trips: number | null,
  tempMean: number,
  tempMin: number,
  tempMax: number,
  precipMm: number,
  weatherSource: 'archive' | 'forecast',
}

// System-wide recommendation for one date and window: sum of station p50 times a factor
// learned from past days. Summing station p90s would assume every station has its bad day at once.
export interface SystemTotal {
  date: string,
  window: WindowName,
  mode: DashboardMode,
  sumP50: number,
  factor: number,
  systemP90: number,
  actual: number | null,
}

export interface DashboardData {
  stations: Station[],
  predictions: WindowPrediction[],
  metrics: MetricRow[],
  routes: Route[],
  profiles: ProfileRow[],
  weatherEffects: WeatherEffect[],
  userType: UserTypeSummary,
  cleaning: CleaningSummary,
  daily: DailyPoint[],
  systemTotals: SystemTotal[],
}
