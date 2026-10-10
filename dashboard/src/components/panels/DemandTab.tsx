'use client'

import { useMemo, useState } from 'react'
import { useDashboard } from '@/state/DashboardContext'
import { Card, SegmentedControl, Stat } from '@/components/layout/ui'
import { ClientMap } from '@/components/map/MapLoader'
import type { LineSpec, MarkerSpec } from '@/components/map/LeafletMap'
import { DemandHeatmap, TopStationsChart, UserTypeChart } from '@/components/charts/DemandCharts'
import { formatInt, formatOneDecimal, formatPercent, formatSignedPercent } from '@/lib/format'
import { balanceRoleAction, balanceRoleKey, balanceRoleLabel, balanceRoleOrder, segmentActionLabel, segmentLabel } from '@/lib/labels'
import { departuresHeatmap, peakShare, stationName, weatherSummary } from '@/lib/selectors'
import type { BalanceRole } from '@/types/domain'

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
          <Card title="Estaciones más usadas" subtitle="Salidas en todo el año (oct 2025 a sep 2026)">
            <TopStationsChart names={topStations.map((station) => station.name)} values={topStations.map((station) => station.totalDeparturesYear)} />
          </Card>
          <Card title="Rutas más usadas" subtitle="Viajes entre estaciones en todo el año. Grosor de la línea: número de viajes.">
            <div className="mb-3">
              <SegmentedControl<RouteCount>
                label="Rutas a mostrar"
                value={routeCount}
                onChange={setRouteCount}
                options={[{ value: '10', label: 'Top 10' }, { value: '25', label: 'Top 25' }, { value: '50', label: 'Top 50' }]}
              />
            </div>
            <ClientMap markers={markers} lines={lines} height={420} />
            <p className="mt-2 text-xs text-slate-500">Las rutas que empiezan y terminan en la misma estación están en la tabla, pero no se dibujan.</p>
          </Card>
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
          <Card title="Tipo de estación: acción distinta para cada rol" subtitle="Rol según el flujo neto promedio entre semana (perfiles de todo el año). Más de 3 bicis netas: se llena. Menos de -3: se vacía.">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-1.5">Rol</th><th className="text-right">Estaciones</th><th className="pl-4">Acción sugerida</th></tr></thead>
              <tbody>
                {roleGroups.map((group) => {
                  const role: BalanceRole = group.members[0].balanceRole
                  const example = [...group.members].sort((a, b) => b.totalDeparturesYear - a.totalDeparturesYear)[0]
                  return (
                    <tr key={group.key} className="border-t border-slate-100 align-top">
                      <td className="py-2">
                        <div className="font-medium text-slate-900">{balanceRoleLabel(role)}</div>
                        <div className="text-xs text-slate-500">Ej. {example.name}</div>
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums">{group.members.length}</td>
                      <td className="py-2 pl-4 text-slate-700">{balanceRoleAction(role)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <h4 className="mt-4 font-semibold text-slate-900">Segmentos del modelo (KMeans sobre el perfil de 24 horas)</h4>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {segmentGroups.map((group) => (
                <li key={group.segment}>
                  <span className="font-medium">{segmentLabel(group.segment)}</span>: {group.count} estaciones. {segmentActionLabel(group.action)}
                </li>
              ))}
            </ul>
          </Card>

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
            <Card title="Hora y tipo de usuario" subtitle="Viajes por hora de inicio, todo el año. Miembros contra ocasionales.">
              <UserTypeChart byHour={data.userType.byHour} />
              <p className="mt-2 text-sm text-slate-700">
                Los miembros marcan los picos de traslado al trabajo (8 am y 5 a 6 pm). Las estaciones de traslado necesitan
                reabasto puntual antes del pico.
              </p>
            </Card>
          </div>
        </div>
      </section>
    </div>
  )
}
