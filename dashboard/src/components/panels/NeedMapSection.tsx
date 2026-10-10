'use client'

import { useMemo } from 'react'
import { useDashboard } from '@/state/DashboardContext'
import { ClientMap } from '@/components/map/MapLoader'
import type { MarkerSpec } from '@/components/map/LeafletMap'
import { Legend } from '@/components/map/Legend'
import { FullscreenFrame } from '@/components/map/FullscreenFrame'
import { Card, Note, Stat } from '@/components/layout/ui'
import { diffColor, diffLegend, inactiveColor, needColor, needLegend } from '@/lib/colorScales'
import { formatDateLong, formatInt, formatOneDecimal, formatPercent, formatSigned } from '@/lib/format'
import { needValue, predictionsByStation, systemTotals } from '@/lib/selectors'
import { windowLabels } from '@/lib/labels'
import type { WindowPrediction } from '@/types/domain'

function markerRadius(departures: number): number {
  return Math.min(22, 4 + Math.sqrt(Math.max(0, departures)) * 1.5)
}

export function NeedMapSection() {
  const { data, mode, date, window, level, backtestView, selectedStationKey, selectStation } = useDashboard()
  const levelName = level === 'p90' ? 'seguro (p90)' : 'típico (p50)'

  const byStation = useMemo(
    () => predictionsByStation(data.predictions, mode, date, window),
    [data.predictions, mode, date, window],
  )
  const totals = useMemo(() => systemTotals([...byStation.values()]), [byStation])

  // Value shown on the map for one station, following the controls. Null means no value.
  const shownValue = (row: WindowPrediction): number | null => {
    if (mode === 'forecast' || backtestView === 'predicted') return needValue(row, level)
    if (backtestView === 'actual') return row.needActual
    return row.needActual === null ? null : row.needActual - needValue(row, level)
  }

  const markers: MarkerSpec[] = data.stations.map((station) => {
    const row = byStation.get(station.stationKey)
    if (station.status === 'inactive') {
      return {
        key: station.stationKey, lat: station.lat, lng: station.lng, color: inactiveColor, radius: 5,
        tooltip: `${station.name}: sin actividad reciente`, muted: true,
      }
    }
    if (!row) {
      return {
        key: station.stationKey, lat: station.lat, lng: station.lng, color: '#ffffff', radius: 5,
        tooltip: `${station.name}: sin actividad registrada este día`, muted: true,
      }
    }
    const value = shownValue(row)
    const isDifference = mode === 'backtest' && backtestView === 'difference'
    const color = value === null ? '#ffffff' : isDifference ? diffColor(value) : needColor(value)
    const valueText = value === null ? 'sin dato' : isDifference ? `${formatSigned(value)} bicis` : `${formatOneDecimal(value)} bicis`
    return {
      key: station.stationKey,
      lat: station.lat,
      lng: station.lng,
      color,
      radius: markerRadius(row.departuresPred),
      tooltip: `${station.name}: ${valueText}`,
      muted: false,
    }
  })

  const topStations = [...byStation.values()]
    .sort((a, b) => needValue(b, level) - needValue(a, level))
    .slice(0, 10)
  const stationByKey = new Map(data.stations.map((station) => [station.stationKey, station]))
  const missingCount = data.stations.filter((station) => station.status !== 'inactive' && !byStation.has(station.stationKey)).length

  const mapTitle = mode === 'forecast' || backtestView === 'predicted'
    ? `Bicis necesarias al inicio de la ventana, nivel ${levelName}`
    : backtestView === 'actual'
      ? 'Necesidad real observada al inicio de la ventana'
      : `Diferencia: real menos predicho (${levelName})`

  const mapSubtitle = `${formatDateLong(date)}. ${windowLabels[window]}. Tamaño del círculo: salidas esperadas.`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total típico (p50)" value={formatInt(totals.typical)} hint="bicis en todo el sistema" />
        <Stat label="Total seguro (p90)" value={formatInt(totals.safe)} hint="bicis recomendadas" tone="accent" />
        {mode === 'backtest' && (
          <>
            <Stat label="Total real" value={formatInt(totals.actual)} hint="lo que de verdad se necesitó" />
            <Stat
              label="Estaciones cubiertas"
              value={formatPercent(totals.coveredShare, 0)}
              hint="real menor o igual al nivel seguro"
            />
          </>
        )}
      </div>

      {mode === 'forecast' && (
        <Note>
          Pronóstico precargado con el modelo de septiembre y el pronóstico del clima. No hay datos reales para
          compararlo. La calidad del modelo se mide en la validación de agosto y septiembre.
        </Note>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title={mapTitle} subtitle={mapSubtitle}>
          <FullscreenFrame
            title={mapTitle}
            subtitle={mapSubtitle}
            footer={(
              <Legend
                title={backtestView === 'difference' && mode === 'backtest' ? 'Real menos predicho' : 'Bicis'}
                items={backtestView === 'difference' && mode === 'backtest' ? diffLegend() : needLegend()}
                extra={[
                  { label: 'Sin actividad reciente', color: inactiveColor, dashed: true },
                  { label: `Sin viajes este día (${missingCount})`, color: '#ffffff', dashed: true },
                ]}
              />
            )}
          >
            {(expanded) => (
              // The map always fills this box. Only the box changes size.
              <div className={expanded ? 'min-h-0 flex-1' : ''} style={expanded ? undefined : { height: 520 }}>
                <ClientMap
                  markers={markers}
                  selectedKey={selectedStationKey}
                  onSelect={selectStation}
                  height="100%"
                />
              </div>
            )}
          </FullscreenFrame>
        </Card>

        <Card title="Top 10 estaciones" subtitle={`Por necesidad ${levelName}. Haz clic para ver el detalle.`}>
          <ol className="flex flex-col gap-1">
            {topStations.map((row, index) => {
              const station = stationByKey.get(row.stationKey)
              const selected = row.stationKey === selectedStationKey
              return (
                <li key={row.stationKey}>
                  <button
                    type="button"
                    onClick={() => selectStation(row.stationKey)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition ${
                      selected ? 'bg-brand-100' : 'hover:bg-slate-100'}`}
                  >
                    <span className="w-6 text-right text-sm font-semibold text-slate-400">{index + 1}</span>
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-500"
                      style={{ background: needColor(needValue(row, level)) }}
                    />
                    <span className="flex-1 truncate text-sm font-medium text-slate-800">{station?.name ?? row.stationKey}</span>
                    <span className="text-base font-bold tabular-nums text-slate-900">{formatOneDecimal(needValue(row, level))}</span>
                    {mode === 'backtest' && (
                      <span className="w-12 text-right text-xs tabular-nums text-slate-500" title="Necesidad real">
                        real {formatInt(row.needActual)}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </Card>
      </div>
    </div>
  )
}
