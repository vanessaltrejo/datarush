'use client'

import { useMemo, useState } from 'react'
import { useDashboard } from '@/state/DashboardContext'
import { Card, SegmentedControl, Stat } from '@/components/layout/ui'
import { RoleActionsCard } from './RoleActionsCard'
import { ClientMap } from '@/components/map/MapLoader'
import type { LineSpec, MarkerSpec } from '@/components/map/LeafletMap'
import { DemandHeatmap, TopStationsChart, UserTypeChart } from '@/components/charts/DemandCharts'
import { formatInt, formatOneDecimal, formatPercent, formatSignedPercent } from '@/lib/format'
import { balanceRoleKey, balanceRoleOrder } from '@/lib/labels'
import { departuresHeatmap, peakShare, stationName, weatherSummary } from '@/lib/selectors'

type RouteCount = '10' | '25' | '50'

export function DemandTab() {
  const { data } = useDashboard()
  const [routeCount, setRouteCount] = useState<RouteCount>('25')
  const [heatmapStation, setHeatmapStation] = useState<string>('all')

  const topStations = useMemo(
    () => [...data.stations].sort((a, b) => b.totalDeparturesYear - a.totalDeparturesYear).slice(0, 10),
    [data.stations],
  )
  const stationByKey = useMemo(() => new Map(data.stations.map((station) => [station.stationKey, station])), [data.stations])
  const shownRoutes = data.routes.slice(0, Number(routeCount))
  const maxTrips = shownRoutes[0]?.trips ?? 1

  const lines: LineSpec[] = shownRoutes.flatMap((route) => {
    const start = stationByKey.get(route.startStationKey)
    const end = stationByKey.get(route.endStationKey)
    if (!start || !end || start.stationKey === end.stationKey) return []
    return [{
      key: `${route.startStationKey}-${route.endStationKey}`,
      positions: [[start.lat, start.lng], [end.lat, end.lng]],
      weight: 1.5 + (route.trips / maxTrips) * 9,
      tooltip: `${start.name} → ${end.name}: ${formatInt(route.trips)} viajes`,
    }]
  })
  const routeStationKeys = new Set(shownRoutes.flatMap((route) => [route.startStationKey, route.endStationKey]))
  const markers: MarkerSpec[] = data.stations.map((station) => ({
    key: station.stationKey,
    lat: station.lat,
    lng: station.lng,
    color: routeStationKeys.has(station.stationKey) ? '#015cab' : '#d1d5db',
    radius: routeStationKeys.has(station.stationKey) ? 6 : 3,
    tooltip: station.name,
    muted: !routeStationKeys.has(station.stationKey),
  }))

  const heatmap = useMemo(
    () => departuresHeatmap(data.profiles, heatmapStation === 'all' ? null : heatmapStation),
    [data.profiles, heatmapStation],
  )
  const eveningShare = peakShare(data.userType.byHour, 16, 19)
  const memberTotal = data.userType.byHour.reduce((sum, row) => sum + row.member, 0)
  const weather = weatherSummary(data.weatherEffects)

  const roleGroups = balanceRoleOrder.map((key) => {
    const members = data.stations.filter((station) => balanceRoleKey(station.balanceRole) === key)
    return { key, members }
  }).filter((group) => group.members.length > 0)
  const segmentGroups = [...new Set(data.stations.map((station) => station.segment))].map((segment) => {
    const members = data.stations.filter((station) => station.segment === segment)
    return { segment, action: members[0]?.segmentAction ?? '', count: members.length }
  }).sort((a, b) => b.count - a.count)

  const sortedStations = [...data.stations].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Viajes analizados" value={formatInt(data.userType.totalTrips)} hint="oct 2025 a sep 2026, ya limpios" />
        <Stat label="Viajes entre 4 y 8 pm" value={formatPercent(eveningShare, 0)} hint="un tercio de todo el año" tone="accent" />
        <Stat label="Viajes de miembros" value={formatPercent(memberTotal / data.userType.totalTrips, 0)} hint="el resto son ocasionales" />
        <Stat
          label="Necesidad con lluvia"
          value={formatSignedPercent(weather.medianChange)}
          hint={`mediana de ${weather.combinations} combinaciones estación y ventana`}
        />
      </div>

      <section>
        <h2 className="text-xl font-bold text-slate-900">Dónde se concentra la demanda</h2>
        <div className="mt-3 grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Estaciones más usadas</h3>
            <p className="mt-0.5 text-sm text-slate-500">Salidas en todo el año (oct 2025 a sep 2026)</p>
            {/* The chart fills the card, so there is no empty space under it. */}
            <div className="mt-4 min-h-[360px] flex-1">
              <TopStationsChart
                names={topStations.map((station) => station.name)}
                values={topStations.map((station) => station.totalDeparturesYear)}
                height="100%"
              />
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {/* Title on the left, route count on the right corner, so no row is wasted. */}
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-900">Rutas más usadas</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Viajes entre estaciones en todo el año. Grosor de la línea: número de viajes.
                </p>
              </div>
              <div className="shrink-0">
                <SegmentedControl<RouteCount>
                  label="Rutas a mostrar"
                  value={routeCount}
                  onChange={setRouteCount}
                  options={[{ value: '10', label: 'Top 10' }, { value: '25', label: 'Top 25' }, { value: '50', label: 'Top 50' }]}
                />
              </div>
            </div>
            <div className="mt-4">
              <ClientMap markers={markers} lines={lines} height={440} />
            </div>
            <p className="mt-2 text-xs text-slate-500">Las rutas que empiezan y terminan en la misma estación están en la tabla, pero no se dibujan.</p>
          </section>
        </div>
        <Card className="mt-4" title={`Tabla de las ${routeCount} rutas más usadas`} subtitle="Todo el año (oct 2025 a sep 2026)">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-slate-500">
                <tr><th className="py-1.5">#</th><th>Desde</th><th>Hacia</th><th className="text-right">Viajes</th><th className="text-right">Minutos promedio</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {shownRoutes.map((route, index) => (
                  <tr key={`${route.startStationKey}-${route.endStationKey}`} className="border-t border-slate-100">
                    <td className="py-1.5 text-slate-400">{index + 1}</td>
                    <td>{stationName(data.stations, route.startStationKey)}</td>
                    <td>{route.startStationKey === route.endStationKey ? 'misma estación (viaje circular)' : stationName(data.stations, route.endStationKey)}</td>
                    <td className="text-right font-semibold">{formatInt(route.trips)}</td>
                    <td className="text-right">{formatOneDecimal(route.avgDurationMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900">Cuándo se concentra la demanda</h2>
        <Card className="mt-3" title="Salidas promedio por hora y día de la semana" subtitle="Todo el año (oct 2025 a sep 2026). Para el sistema se suman los promedios de cada estación.">
          <label className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-semibold text-slate-600">Ver:</span>
            <select
              value={heatmapStation}
              onChange={(event) => setHeatmapStation(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            >
              <option value="all">Todo el sistema</option>
              {sortedStations.map((station) => <option key={station.stationKey} value={station.stationKey}>{station.name}</option>)}
            </select>
          </label>
          <DemandHeatmap matrix={heatmap} />
        </Card>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900">Qué causa la necesidad, y qué hacer en cada caso</h2>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          <RoleActionsCard roleGroups={roleGroups} segmentGroups={segmentGroups} totalStations={data.stations.length} />

          <div className="flex flex-col gap-4">
            <Card title="Clima: la lluvia baja la necesidad" subtitle={`Todo el año. ${weather.combinations} combinaciones de estación y ventana del archivo weather_effect.csv.`}>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Mediana total" value={formatSignedPercent(weather.medianChange)} />
                <Stat label="Mañana" value={formatSignedPercent(weather.medianChangeAm)} />
                <Stat label="Tarde" value={formatSignedPercent(weather.medianChangePm)} />
              </div>
              <p className="mt-3 text-sm text-slate-700">
                La necesidad bajó con lluvia en el {formatPercent(weather.shareLower, 0)} de las combinaciones.
                En días de lluvia se puede reabastecer menos, sobre todo en la mañana.
              </p>
            </Card>
            <section className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Hora y tipo de usuario</h3>
              <p className="mt-0.5 text-sm text-slate-500">Viajes por hora de inicio, todo el año. Miembros contra ocasionales.</p>
              {/* The chart takes the free height, so both columns end at the same line. */}
              <div className="mt-4 min-h-[300px] flex-1">
                <UserTypeChart byHour={data.userType.byHour} height="100%" />
              </div>
              <p className="mt-2 text-sm text-slate-700">
                Los miembros marcan los picos de traslado al trabajo (8 am y 5 a 6 pm). Las estaciones de traslado necesitan
                reabasto puntual antes del pico.
              </p>
            </section>
          </div>
        </div>
      </section>
    </div>
  )
}
