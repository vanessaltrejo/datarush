'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import type { CircleMarker as LeafletCircleMarker } from 'leaflet'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'

export interface MarkerSpec {
  key: string,
  lat: number,
  lng: number,
  color: string,
  radius: number,
  tooltip: string,
  muted: boolean,
}

export interface LineSpec {
  key: string,
  positions: [number, number][],
  weight: number,
  tooltip: string,
}

interface LeafletMapProps {
  markers: MarkerSpec[],
  lines?: LineSpec[],
  selectedKey?: string | null,
  // Stations that get a pulsing ring to show that they can be clicked.
  pulseKeys?: string[],
  onSelect?: (key: string) => void,
  height: number | string,
}

const mapCenter: [number, number] = [40.723, -74.043]

// Leaflet does not notice when its container changes size (for example in full screen).
function ResizeSync() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [map])
  return null
}

// Base map tiles need internet. If they fail, markers still draw on the plain background.
export default function LeafletMap({
  markers, lines = [], selectedKey = null, pulseKeys = [], onSelect, height,
}: LeafletMapProps) {
  return (
    <MapContainer
      center={mapCenter}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height, width: '100%', background: '#eef0f3', borderRadius: 12 }}
    >
      <ResizeSync />
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {lines.map((line) => (
        <Polyline
          key={line.key}
          positions={line.positions}
          pathOptions={{ color: '#f04c25', weight: line.weight, opacity: 0.7 }}
        >
          <Tooltip sticky>{line.tooltip}</Tooltip>
        </Polyline>
      ))}
      {markers.filter((marker) => pulseKeys.includes(marker.key)).map((marker) => (
        <CircleMarker
          key={`pulse-${marker.key}`}
          center={[marker.lat, marker.lng]}
          radius={marker.radius + 2}
          interactive={false}
          className="pulse-ring"
          pathOptions={{ color: '#015cab', weight: 3, fill: false }}
        />
      ))}
      {markers.map((marker) => {
        const isSelected = marker.key === selectedKey
        const baseColor = isSelected ? '#111827' : marker.muted ? '#9ca3af' : '#4b5563'
        const baseWeight = isSelected ? 3 : 1
        return (
          <CircleMarker
            key={marker.key}
            center={[marker.lat, marker.lng]}
            radius={isSelected ? marker.radius + 3 : marker.radius}
            pathOptions={{
              color: baseColor,
              weight: baseWeight,
              fillColor: marker.color,
              fillOpacity: marker.muted ? 0.45 : 0.9,
              dashArray: marker.muted ? '3 3' : undefined,
            }}
            eventHandlers={onSelect ? {
              click: () => onSelect(marker.key),
              mouseover: (event) => {
                const circle = event.target as LeafletCircleMarker
                // Only the style changes. Moving the element in the DOM would break the click.
                circle.setStyle({ color: '#015cab', weight: 4 })
              },
              mouseout: (event) => {
                const circle = event.target as LeafletCircleMarker
                circle.setStyle({ color: baseColor, weight: baseWeight })
              },
            } : undefined}
          >
            <Tooltip direction="top" offset={[0, -4]}>{marker.tooltip}</Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
