'use client'

import { useCallback, useMemo, useState } from 'react'
import { useDashboard } from '@/state/DashboardContext'
import { ClientMap } from '@/components/map/MapLoader'
import type { MarkerSpec } from '@/components/map/LeafletMap'
import { Legend } from '@/components/map/Legend'
import { FullscreenFrame } from '@/components/map/FullscreenFrame'
import { Card, Note, Stat } from '@/components/layout/ui'
import { NeedHeadline } from './NeedHeadline'
import { StationFocusCard } from './StationFocusCard'
import { diffColor, diffLegend, inactiveColor, needColor, needLegend } from '@/lib/colorScales'
import { formatDateLong, formatInt, formatOneDecimal, formatPercent, formatSigned } from '@/lib/format'
import { needValue, predictionsByStation, systemTotals } from '@/lib/selectors'
import type { WindowPrediction } from '@/types/domain'

function markerRadius(departures: number): number {
  return Math.min(22, 4 + Math.sqrt(Math.max(0, departures)) * 1.5)
}

export function NeedMapSection() {
  const { data, mode, date, window, level, backtestView, selectedStationKey, focusStation } = useDashboard()
  const levelName = level === 'p90' ? 'protección alta (p90)' : 'protección media (p50)'
  const levelCoverage = level === 'p90' ? 'cubre 9 de cada 10 días' : 'cubre la mitad de los días'
  const hour = window === 'AM' ? '6:00' : '14:00'

  const byStation = useMemo(
    () => predictionsByStation(data.predictions, mode, date, window),
    [data.predictions, mode, date, window],
  )
  const totals = useMemo(() => systemTotals([...byStation.values()]), [byStation])

  // A click on a station opens its detail. In real full screen the drawer would be hidden, so leave it first.
  // The hint and the pulsing rings stay until the first click on a circle. After that the user knows.
  const [mapHintSeen, setMapHintSeen] = useState(false)
  const handleSelect = useCallback((stationKey: string) => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    setMapHintSeen(true)
    focusStation(stationKey)
  }, [focusStation])

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
  const topRow = topStations[0]
  const topName = topRow ? stationByKey.get(topRow.stationKey)?.name ?? topRow.stationKey : null

  const mapTitle = mode === 'forecast' || backtestView === 'predicted'
    ? `Bicis que debe haber en cada estación a las ${hour}`
    : backtestView === 'actual'
      ? `Bicis que de verdad se necesitaron a las ${hour}`
      : 'Diferencia entre lo real y lo predicho'
  const mapSubtitle = `${formatDateLong(date)}. ${levelName[0].toUpperCase()}${levelName.slice(1)}: ${levelCoverage}. Tamaño del círculo: salidas esperadas.`
  const valueHeader = level === 'p90' ? 'Recomendado' : 'Típico'

  return (
    <div className="flex flex-col gap-4">
      <NeedHeadline
        mode={mode}
        date={date}
        window={window}
        level={level}
        totals={totals}
        topName={topName}
        topValue={topRow ? needValue(topRow, level) : null}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total en un día típico" value={formatInt(totals.typical)} hint="bicis en todo el sistema (p50)" />
        <Stat label="Total recomendado" value={formatInt(totals.safe)} hint="bicis, cubre 9 de cada 10 días (p90)" tone="accent" />
        {mode === 'backtest' && (
          <>
            <Stat label="Lo que de verdad se necesitó" value={formatInt(totals.actual)} hint="dato real de ese día" />
            <Stat
              label="Estaciones donde alcanzó"
              value={formatPercent(totals.coveredShare, 0)}
              hint="la recomendación fue suficiente"
            />
          </>
        )}
      </div>

      {mode === 'forecast' && (
        <Note>
          Pronóstico precargado con el modelo de septiembre y el pronóstico del clima. No hay datos reales para
          compararlo. La calidad del modelo se mide con los datos pasados de julio, agosto y septiembre.
        </Note>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">{mapTitle}</h3>
          <p className="mt-0.5 text-sm text-slate-500">{mapSubtitle}</p>
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
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
                // The map always fills this box. In the page it grows with the card, with a minimum height.
                <div className={`relative flex-1 ${expanded ? 'min-h-0' : 'min-h-[520px]'}`}>
                  <ClientMap
                    markers={markers}
                    selectedKey={selectedStationKey}
                    pulseKeys={mapHintSeen ? [] : topStations.slice(0, 3).map((row) => row.stationKey)}
                    onSelect={handleSelect}
                    height="100%"
                  />
                  {!mapHintSeen && (
                    <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2">
                      <div className="hint-bob flex items-center gap-2 rounded-full bg-brand-700 px-4 py-2 text-sm font-bold text-white shadow-lg ring-4 ring-white/70">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 4.1 12 6M5.1 8l-2.9-.8M6 12l-1.9 2M7.2 2.2 8 5.1M9.04 9.69a.5.5 0 0 1 .65-.65l11 4.5a.5.5 0 0 1-.07.95l-4.35 1.04a1 1 0 0 0-.74.74l-1.04 4.35a.5.5 0 0 1-.95.07z" />
                        </svg>
                        Haz clic en un círculo para ver esa estación
                      </div>
                    </div>
                  )}
                </div>
              )}
            </FullscreenFrame>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <StationFocusCard />

          <Card title="Top 10 estaciones" subtitle={`Las que más bicis necesitan, ${levelName}. Haz clic para abrir el detalle.`}>
            <div className="flex items-center gap-3 px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span className="w-6" />
              <span className="w-3.5" />
              <span className="flex-1">Estación</span>
              <span>{valueHeader}</span>
              {mode === 'backtest' && <span className="w-12 text-right">Real</span>}
            </div>
            <ol className="flex flex-col gap-0.5">
              {topStations.map((row, index) => {
                const station = stationByKey.get(row.stationKey)
                const selected = row.stationKey === selectedStationKey
                return (
                  <li key={row.stationKey}>
                    <button
                      type="button"
                      onClick={() => focusStation(row.stationKey)}
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
                        <span className="w-12 text-right text-sm tabular-nums text-slate-500" title="Necesidad real">
                          {formatInt(row.needActual)}
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
    </div>
  )
}
