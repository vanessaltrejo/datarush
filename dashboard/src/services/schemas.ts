import { z } from 'zod'

// Raw shapes of the JSON files in public/data. Column names match the repo CSV files.

const windowName = z.enum(['AM', 'PM'])
const flowTrend = z.enum(['fills', 'drains', 'flat'])

export const rawStationSchema = z.object({
  station_key: z.string(),
  station_ids: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  segment: z.string(),
  segment_action: z.string(),
  total_departures_year: z.number(),
  annual_net_imbalance: z.number(),
  mae_am: z.number().nullable(),
  mae_pm: z.number().nullable(),
  coverage_am: z.number().nullable(),
  coverage_pm: z.number().nullable(),
  is_relocation: z.boolean(),
  status: z.enum(['active', 'new', 'inactive']),
  am_net_weekday: z.number(),
  pm_net_weekday: z.number(),
  balance_role: z.string().transform((value, context) => {
    const [am, pm] = value.split('_')
    const parsedAm = flowTrend.safeParse(am)
    const parsedPm = flowTrend.safeParse(pm)
    if (!parsedAm.success || !parsedPm.success) {
      context.addIssue({ code: 'custom', message: `Bad balance role: ${value}` })
      return z.NEVER
    }
    return { am: parsedAm.data, pm: parsedPm.data }
  }),
  member_trips: z.number(),
  casual_trips: z.number(),
})

export const rawPredictionSchema = z.object({
  station_key: z.string(),
  date: z.string(),
  window: windowName,
  mode: z.enum(['backtest', 'forecast']),
  need_p50: z.number(),
  need_p90: z.number(),
  need_actual: z.number().nullable(),
  baseline_p50: z.number().nullable(),
  baseline_p90: z.number().nullable(),
  covered: z.boolean().nullable(),
  departures_pred: z.number(),
  rain: z.boolean(),
})

export const rawHourlySchema = z.object({
  station_key: z.string(),
  datetime_hour: z.string(),
  departures_actual: z.number(),
  departures_pred: z.number(),
  departures_lo: z.number(),
  departures_hi: z.number(),
  net_flow_actual: z.number(),
  net_flow_pred: z.number(),
})

export const rawMetricSchema = z.object({
  model: z.string(),
  fold: z.string(),
  window: z.string(),
  day_type: z.string(),
  mae: z.number(),
  rmse: z.number(),
  pinball: z.number(),
  coverage: z.number(),
  total_bikes: z.number(),
  n: z.number(),
})

export const rawRouteSchema = z.object({
  start_station_key: z.string(),
  end_station_key: z.string(),
  trips: z.number(),
  avg_duration_min: z.number(),
})

export const rawProfileSchema = z.object({
  station_key: z.string(),
  hour: z.number(),
  day_of_week: z.number(),
  avg_departures: z.number(),
  avg_arrivals: z.number(),
  avg_net: z.number(),
})

export const rawWeatherEffectSchema = z.object({
  station_key: z.string(),
  window: windowName,
  avg_need_dry: z.number(),
  avg_need_rain: z.number(),
  pct_change: z.number().nullable(),
  n_dry: z.number(),
  n_rain: z.number(),
})

export const userTypeSchema = z.object({
  byHour: z.array(z.object({ hour: z.number(), member: z.number(), casual: z.number() })),
  totalTrips: z.number(),
})

export const rawDailySchema = z.object({
  date: z.string(),
  trips: z.number().nullable(),
  temp_mean: z.number(),
  temp_min: z.number(),
  temp_max: z.number(),
  precip_mm: z.number(),
  weather_source: z.enum(['archive', 'forecast']),
})

export const cleaningSchema = z.object({
  rawTrips: z.number(),
  steps: z.array(z.object({ rule: z.string(), rows: z.number() })),
})
