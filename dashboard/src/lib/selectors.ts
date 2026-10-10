import type {
  DashboardMode, NeedLevel, ProfileRow, Station, UserTypeHour, WeatherEffect, WindowName, WindowPrediction,
} from '@/types/domain'

export function datesForMode(predictions: WindowPrediction[], mode: DashboardMode): string[] {
  const dates = new Set<string>()
  for (const row of predictions) if (row.mode === mode) dates.add(row.date)
  return [...dates].sort()
}

export function predictionsByStation(
  predictions: WindowPrediction[], mode: DashboardMode, date: string, window: WindowName,
): Map<string, WindowPrediction> {
  const result = new Map<string, WindowPrediction>()
  for (const row of predictions) {
    if (row.mode === mode && row.date === date && row.window === window) result.set(row.stationKey, row)
  }
  return result
}

export function needValue(row: WindowPrediction, level: NeedLevel): number {
  return level === 'p50' ? row.needP50 : row.needP90
}

export interface SystemTotals {
  typical: number,
  safe: number,
  actual: number | null,
  stationCount: number,
  coveredShare: number | null,
}

export function systemTotals(rows: WindowPrediction[]): SystemTotals {
  let typical = 0
  let safe = 0
  let actual = 0
  let actualCount = 0
  let coveredCount = 0
  for (const row of rows) {
    typical += row.needP50
    safe += row.needP90
    if (row.needActual !== null) {
      actual += row.needActual
      actualCount += 1
      if (row.covered) coveredCount += 1
    }
  }
  return {
    typical,
    safe,
    actual: actualCount > 0 ? actual : null,
    stationCount: rows.length,
    coveredShare: actualCount > 0 ? coveredCount / actualCount : null,
  }
}

export function stationSeries(
  predictions: WindowPrediction[], stationKey: string, mode: DashboardMode, window: WindowName,
): WindowPrediction[] {
  return predictions
    .filter((row) => row.stationKey === stationKey && row.mode === mode && row.window === window)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Hour x weekday matrix of average departures. For the system, station averages are summed.
export function departuresHeatmap(profiles: ProfileRow[], stationKey: string | null): number[][] {
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const row of profiles) {
    if (stationKey !== null && row.stationKey !== stationKey) continue
    matrix[row.dayOfWeek][row.hour] += row.avgDepartures
  }
  return matrix
}

export function typicalDay(profiles: ProfileRow[], stationKey: string, dayOfWeek: number): ProfileRow[] {
  return profiles
    .filter((row) => row.stationKey === stationKey && row.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.hour - b.hour)
}

export function peakShare(byHour: UserTypeHour[], fromHour: number, toHour: number): number {
  let inside = 0
  let total = 0
  for (const row of byHour) {
    const trips = row.member + row.casual
    total += trips
    if (row.hour >= fromHour && row.hour <= toHour) inside += trips
  }
  return total > 0 ? inside / total : 0
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export interface WeatherSummary {
  combinations: number,
  medianChange: number | null,
  medianChangeAm: number | null,
  medianChangePm: number | null,
  shareLower: number,
}

// Uses every row of weather_effect.csv as it comes from the repo. No extra filter.
export function weatherSummary(effects: WeatherEffect[]): WeatherSummary {
  const valid = effects.filter((row) => row.pctChange !== null)
  const changes = (window: WindowName | null): number[] => valid
    .filter((row) => window === null || row.window === window)
    .map((row) => row.pctChange ?? 0)
  const all = changes(null)
  return {
    combinations: valid.length,
    medianChange: median(all),
    medianChangeAm: median(changes('AM')),
    medianChangePm: median(changes('PM')),
    shareLower: all.length > 0 ? all.filter((value) => value < 0).length / all.length : 0,
  }
}

export interface EqualCoverageResult {
  month: string,
  rows: number,
  modelCoverage: number,
  modelBikes: number,
  baselineShift: number,
  baselineCoverage: number,
  baselineBikes: number,
}

// Shift the baseline safe level by one constant until it covers as many days as the model.
// Then compare how many bikes each one commits. Calculated in the dashboard.
export function equalCoverage(predictions: WindowPrediction[], monthPrefix: string): EqualCoverageResult | null {
  const rows = predictions.filter((row) => row.mode === 'backtest' && row.date.startsWith(monthPrefix)
    && row.needActual !== null && row.baselineP90 !== null)
  if (rows.length === 0) return null
  const covers = (shift: number): number => rows
    .filter((row) => (row.needActual ?? 0) <= (row.baselineP90 ?? 0) + shift + 1e-9).length / rows.length
  const modelCoverage = rows.filter((row) => row.covered).length / rows.length
  const modelBikes = rows.reduce((sum, row) => sum + row.needP90, 0)
  for (let step = 0; step <= 2000; step += 1) {
    const shift = step / 100
    const coverage = covers(shift)
    if (coverage >= modelCoverage) {
      return {
        month: monthPrefix,
        rows: rows.length,
        modelCoverage,
        modelBikes,
        baselineShift: shift,
        baselineCoverage: coverage,
        baselineBikes: rows.reduce((sum, row) => sum + Math.max(0, (row.baselineP90 ?? 0) + shift), 0),
      }
    }
  }
  return null
}

export function stationName(stations: Station[], stationKey: string): string {
  return stations.find((station) => station.stationKey === stationKey)?.name ?? stationKey
}
