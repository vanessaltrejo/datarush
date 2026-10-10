import { z } from 'zod'
import type {
  CleaningSummary, DashboardData, HourlyPoint, MetricRow, ProfileRow, Route, Station,
  UserTypeSummary, WeatherEffect, WindowPrediction,
} from '@/types/domain'
import {
  cleaningSchema, rawHourlySchema, rawMetricSchema, rawPredictionSchema, rawProfileSchema,
  rawRouteSchema, rawStationSchema, rawWeatherEffectSchema, userTypeSchema,
} from './schemas'

// The only place that reads data. Files enter as unknown, are validated with zod,
// and leave as typed domain objects. To change the data source, change only this file.

const dataRoot = '/data'

async function fetchJson(fileName: string): Promise<unknown> {
  const response = await fetch(`${dataRoot}/${fileName}`)
  if (!response.ok) {
    throw new Error(`Could not load ${fileName} (status ${response.status})`)
  }
  const body: unknown = await response.json()
  return body
}

async function loadValidated<T extends z.ZodType>(fileName: string, schema: T): Promise<z.output<T>> {
  const body = await fetchJson(fileName)
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new Error(`Invalid data in ${fileName}: ${result.error.issues[0]?.message ?? 'unknown issue'}`)
  }
  return result.data
}

function toStation(raw: z.output<typeof rawStationSchema>): Station {
  return {
    stationKey: raw.station_key,
    stationIds: raw.station_ids.split('|'),
    name: raw.name,
    lat: raw.lat,
    lng: raw.lng,
    segment: raw.segment,
    segmentAction: raw.segment_action,
    totalDeparturesYear: raw.total_departures_year,
    annualNetImbalance: raw.annual_net_imbalance,
    maeAm: raw.mae_am,
    maePm: raw.mae_pm,
    coverageAm: raw.coverage_am,
    coveragePm: raw.coverage_pm,
    isRelocation: raw.is_relocation,
    status: raw.status,
    amNetWeekday: raw.am_net_weekday,
    pmNetWeekday: raw.pm_net_weekday,
    balanceRole: raw.balance_role,
    memberTrips: raw.member_trips,
    casualTrips: raw.casual_trips,
  }
}

function toPrediction(raw: z.output<typeof rawPredictionSchema>): WindowPrediction {
  return {
    stationKey: raw.station_key,
    date: raw.date,
    window: raw.window,
    mode: raw.mode,
    needP50: raw.need_p50,
    needP90: raw.need_p90,
    needActual: raw.need_actual,
    baselineP50: raw.baseline_p50,
    baselineP90: raw.baseline_p90,
    covered: raw.covered,
    departuresPred: raw.departures_pred,
    rain: raw.rain,
  }
}

function toMetric(raw: z.output<typeof rawMetricSchema>): MetricRow {
  return {
    model: raw.model,
    fold: raw.fold,
    window: raw.window,
    dayType: raw.day_type,
    mae: raw.mae,
    rmse: raw.rmse,
    pinball: raw.pinball,
    coverage: raw.coverage,
    totalBikes: raw.total_bikes,
    n: raw.n,
  }
}

function toRoute(raw: z.output<typeof rawRouteSchema>): Route {
  return {
    startStationKey: raw.start_station_key,
    endStationKey: raw.end_station_key,
    trips: raw.trips,
    avgDurationMin: raw.avg_duration_min,
  }
}

function toProfile(raw: z.output<typeof rawProfileSchema>): ProfileRow {
  return {
    stationKey: raw.station_key,
    hour: raw.hour,
    dayOfWeek: raw.day_of_week,
    avgDepartures: raw.avg_departures,
    avgArrivals: raw.avg_arrivals,
    avgNet: raw.avg_net,
  }
}

function toWeatherEffect(raw: z.output<typeof rawWeatherEffectSchema>): WeatherEffect {
  return {
    stationKey: raw.station_key,
    window: raw.window,
    avgNeedDry: raw.avg_need_dry,
    avgNeedRain: raw.avg_need_rain,
    pctChange: raw.pct_change,
    nDry: raw.n_dry,
    nRain: raw.n_rain,
  }
}

function toHourly(raw: z.output<typeof rawHourlySchema>): HourlyPoint {
  return {
    stationKey: raw.station_key,
    datetimeHour: raw.datetime_hour,
    departuresActual: raw.departures_actual,
    departuresPred: raw.departures_pred,
    departuresLo: raw.departures_lo,
    departuresHi: raw.departures_hi,
    netFlowActual: raw.net_flow_actual,
    netFlowPred: raw.net_flow_pred,
  }
}

export async function loadDashboardData(): Promise<DashboardData> {
  const [stations, predictions, metrics, routes, profiles, weatherEffects, userType, cleaning] = await Promise.all([
    loadValidated('stations.json', z.array(rawStationSchema)),
    loadValidated('predictions.json', z.array(rawPredictionSchema)),
    loadValidated('metrics.json', z.array(rawMetricSchema)),
    loadValidated('routes.json', z.array(rawRouteSchema)),
    loadValidated('profiles.json', z.array(rawProfileSchema)),
    loadValidated('weatherEffect.json', z.array(rawWeatherEffectSchema)),
    loadValidated('userType.json', userTypeSchema),
    loadValidated('cleaning.json', cleaningSchema),
  ])
  const userTypeSummary: UserTypeSummary = userType
  const cleaningSummary: CleaningSummary = cleaning
  return {
    stations: stations.map(toStation),
    predictions: predictions.map(toPrediction),
    metrics: metrics.map(toMetric),
    routes: routes.map(toRoute),
    profiles: profiles.map(toProfile),
    weatherEffects: weatherEffects.map(toWeatherEffect),
    userType: userTypeSummary,
    cleaning: cleaningSummary,
  }
}

const hourlyCache = new Map<string, Promise<HourlyPoint[]>>()

// Hourly detail exists only for the Aug-Sep backtest. Loaded per station on demand.
export function loadStationHourly(stationKey: string): Promise<HourlyPoint[]> {
  const cached = hourlyCache.get(stationKey)
  if (cached) return cached
  const request = loadValidated(`hourly/${stationKey}.json`, z.array(rawHourlySchema))
    .then((rows) => rows.map(toHourly))
  request.catch(() => hourlyCache.delete(stationKey))
  hourlyCache.set(stationKey, request)
  return request
}
