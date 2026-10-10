// Reads the model outputs in ../outputs (and the raw trip CSVs in the repo root)
// and writes small JSON files into public/data for the static dashboard.
// The model is not touched. Column names stay as in the CSV files.
// Run: npm run prepare-data

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'

const dashboardDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(dashboardDir, '..')
const outputsDir = path.join(repoRoot, 'outputs')
const targetDir = path.join(dashboardDir, 'public', 'data')

// On a deploy (for example Vercel with the root folder set to "dashboard") the source
// files may be out of reach. The generated JSON is committed, so we keep it and stop.
const rawTripPattern = /^JC-\d{6}-citibike-tripdata\.csv$/
const hasSources = fs.existsSync(path.join(outputsDir, 'predictions_window.csv'))
  && fs.existsSync(repoRoot)
  && fs.readdirSync(repoRoot).filter((name) => rawTripPattern.test(name)).length === 12
if (!hasSources) {
  if (!fs.existsSync(path.join(targetDir, 'stations.json'))) {
    throw new Error('No source files and no committed data in public/data. Cannot build.')
  }
  console.log('Source files not found. Using the committed JSON in public/data.')
  process.exit(0)
}

// Same relocation map as src/config.py in the pipeline.
const relocations = { HB106: 'HB107', HB508: 'HB503', JC148: 'JC149' }
const amHours = [6, 11]
const pmHours = [14, 19]
const roleThreshold = 3

function readCsv(fileName) {
  const text = fs.readFileSync(path.join(outputsDir, fileName), 'utf8')
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
  if (parsed.errors.length > 0) {
    throw new Error(`${fileName}: ${parsed.errors[0].message}`)
  }
  return parsed.data
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  if (Number.isNaN(parsed)) throw new Error(`Not a number: ${value}`)
  return parsed
}

function toBool(value) {
  if (value === '' || value === undefined) return null
  return value === 'True' || value === 'true' || value === '1' || value === '1.0'
}

function mapRows(rows, numericColumns, boolColumns = []) {
  return rows.map((row) => {
    const result = { ...row }
    for (const column of numericColumns) result[column] = toNumber(row[column])
    for (const column of boolColumns) result[column] = toBool(row[column])
    return result
  })
}

function assertCount(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected} rows, got ${actual}`)
  }
  console.log(`ok  ${label}: ${actual}`)
}

function writeJson(relativePath, data) {
  const filePath = path.join(targetDir, relativePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data))
}

function classify(value) {
  if (value >= roleThreshold) return 'fills'
  if (value <= -roleThreshold) return 'drains'
  return 'flat'
}

// ---------- Load the repo outputs ----------

const stations = mapRows(readCsv('stations.csv'),
  ['lat', 'lng', 'total_departures_year', 'annual_net_imbalance', 'mae_am', 'mae_pm', 'coverage_am', 'coverage_pm'],
  ['is_relocation'])
const predictions = mapRows(readCsv('predictions_window.csv'),
  ['need_p50', 'need_p90', 'need_actual', 'baseline_p50', 'baseline_p90', 'departures_pred'],
  ['covered', 'rain'])
const metrics = mapRows(readCsv('metrics.csv'), ['mae', 'rmse', 'pinball', 'coverage', 'total_bikes', 'n'])
const routes = mapRows(readCsv('routes.csv'), ['trips', 'avg_duration_min'])
const profiles = mapRows(readCsv('profiles.csv'), ['hour', 'day_of_week', 'avg_departures', 'avg_arrivals', 'avg_net'])
const weatherEffect = mapRows(readCsv('weather_effect.csv'), ['avg_need_dry', 'avg_need_rain', 'pct_change', 'n_dry', 'n_rain'])
const hourly = mapRows(readCsv('predictions_hourly.csv'),
  ['departures_actual', 'departures_pred', 'departures_lo', 'departures_hi', 'net_flow_actual', 'net_flow_pred'])

assertCount('stations', stations.length, 111)
assertCount('predictions_window', predictions.length, 13977)
assertCount('predictions backtest', predictions.filter((row) => row.mode === 'backtest').length, 12272)
assertCount('predictions forecast', predictions.filter((row) => row.mode === 'forecast').length, 1705)
assertCount('metrics', metrics.length, 40)
assertCount('routes', routes.length, 200)
assertCount('profiles', profiles.length, 18648)
assertCount('weather_effect', weatherEffect.length, 222)
assertCount('predictions_hourly', hourly.length, 156440)

// ---------- Derived station fields: status and balance role ----------

const backtestKeys = new Set(predictions.filter((row) => row.mode === 'backtest').map((row) => row.station_key))
const forecastKeys = new Set(predictions.filter((row) => row.mode === 'forecast').map((row) => row.station_key))

// Weekday net flow per window: sum over the window hours for each weekday, then average the 5 weekdays.
const windowNet = new Map()
for (const row of profiles) {
  if (row.day_of_week > 4) continue
  const window = row.hour >= amHours[0] && row.hour <= amHours[1] ? 'am'
    : row.hour >= pmHours[0] && row.hour <= pmHours[1] ? 'pm' : null
  if (window === null) continue
  const key = `${row.station_key}|${window}`
  windowNet.set(key, (windowNet.get(key) ?? 0) + row.avg_net)
}

// ---------- User type from the raw trip files (descriptive only, not used by the model) ----------

const rawFiles = fs.readdirSync(repoRoot).filter((name) => rawTripPattern.test(name)).sort()
if (rawFiles.length !== 12) throw new Error(`Expected 12 raw trip files, found ${rawFiles.length}`)

const seenRideIds = new Set()
const hourTotals = Array.from({ length: 24 }, (_, hour) => ({ hour, member: 0, casual: 0 }))
const stationUserTotals = new Map()
let rawRows = 0
let cleanRows = 0

for (const fileName of rawFiles) {
  const text = fs.readFileSync(path.join(repoRoot, fileName), 'utf8')
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
  for (const trip of parsed.data) {
    rawRows += 1
    const startId = (trip.start_station_id ?? '').trim()
    if (startId === '') continue
    if (seenRideIds.has(trip.ride_id)) continue
    seenRideIds.add(trip.ride_id)
    // Times share one text format, so text comparison keeps the order.
    if (trip.ended_at <= trip.started_at) continue
    cleanRows += 1
    const hour = Number(trip.started_at.slice(11, 13))
    const userType = trip.member_casual === 'member' ? 'member' : 'casual'
    hourTotals[hour][userType] += 1
    const stationKey = relocations[startId] ?? startId
    const totals = stationUserTotals.get(stationKey) ?? { member: 0, casual: 0 }
    totals[userType] += 1
    stationUserTotals.set(stationKey, totals)
  }
}

assertCount('raw trips', rawRows, 972092)
// 4 without start station, 18 duplicates, 7 bad durations (pipeline rules 1 to 3).
assertCount('clean departures', cleanRows, 972092 - 4 - 18 - 7)
const yearDepartures = stations.reduce((sum, row) => sum + row.total_departures_year, 0)
assertCount('departures match stations.csv', cleanRows, yearDepartures)

const stationsOut = stations.map((row) => {
  const key = row.station_key
  const status = backtestKeys.has(key) ? 'active' : forecastKeys.has(key) ? 'new' : 'inactive'
  const amNet = windowNet.get(`${key}|am`) ?? 0
  const pmNet = windowNet.get(`${key}|pm`) ?? 0
  const users = stationUserTotals.get(key) ?? { member: 0, casual: 0 }
  return {
    ...row,
    status,
    am_net_weekday: Math.round((amNet / 5) * 10) / 10,
    pm_net_weekday: Math.round((pmNet / 5) * 10) / 10,
    balance_role: `${classify(amNet / 5)}_${classify(pmNet / 5)}`,
    member_trips: users.member,
    casual_trips: users.casual,
  }
})

const statusCount = (status) => stationsOut.filter((row) => row.status === status).length
assertCount('active stations', statusCount('active'), 107)
assertCount('new stations', statusCount('new'), 1)
assertCount('inactive stations', statusCount('inactive'), 3)

// ---------- Cleaning counts from the pipeline log ----------

const qcText = fs.readFileSync(path.join(outputsDir, 'qc_log.txt'), 'utf8')
const cleaningSteps = [...qcText.matchAll(/^\[(rule\d_[a-z0-9_]+)\] rows=(\d+)/gm)]
  .map((match) => ({ rule: match[1], rows: Number(match[2]) }))
assertCount('cleaning rules in qc_log', cleaningSteps.length, 7)

// ---------- Write ----------

fs.rmSync(targetDir, { recursive: true, force: true })
writeJson('stations.json', stationsOut)
writeJson('predictions.json', predictions)
writeJson('metrics.json', metrics)
writeJson('routes.json', routes)
writeJson('profiles.json', profiles)
writeJson('weatherEffect.json', weatherEffect)
writeJson('userType.json', { byHour: hourTotals, totalTrips: cleanRows })
writeJson('cleaning.json', { rawTrips: rawRows, steps: cleaningSteps })

const hourlyByStation = new Map()
for (const row of hourly) {
  const list = hourlyByStation.get(row.station_key) ?? []
  list.push(row)
  hourlyByStation.set(row.station_key, list)
}
assertCount('hourly stations', hourlyByStation.size, 107)
for (const [key, rows] of hourlyByStation) writeJson(`hourly/${key}.json`, rows)

console.log(`done. JSON written to ${path.relative(repoRoot, targetDir)}`)
