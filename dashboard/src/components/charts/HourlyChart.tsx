'use client'

import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { EChart, baseTextStyle } from './EChart'
import { chartColors } from '@/lib/colorScales'
import type { HourlyPoint, ProfileRow } from '@/types/domain'

const hours = Array.from({ length: 24 }, (_, hour) => `${hour}:00`)

const windowAreas = {
  silent: true,
  itemStyle: { color: 'rgba(148, 163, 184, 0.12)' },
  data: [
    [{ xAxis: '6:00', name: 'Mañana' }, { xAxis: '11:00' }],
    [{ xAxis: '14:00', name: 'Tarde' }, { xAxis: '19:00' }],
  ] as [{ xAxis: string, name: string }, { xAxis: string }][],
  label: { fontSize: 11, color: '#64748b' },
}

// Backtest day: real departures against the historical average with the 10th to 90th percentile band.
export function HourlyDayChart({ points }: { points: HourlyPoint[] }) {
  const option = useMemo<EChartsOption>(() => ({
    textStyle: baseTextStyle,
    grid: { left: 44, right: 16, top: 40, bottom: 36 },
    legend: { top: 0, textStyle: { fontSize: 13 }, data: ['Salidas reales', 'Promedio histórico', 'Rango habitual (p10 a p90)'] },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: hours, axisLabel: { interval: 2, fontSize: 12 } },
    yAxis: { type: 'value', name: 'salidas', min: 0 },
    series: [
      {
        name: 'base', type: 'line', stack: 'band', data: points.map((point) => point.departuresLo),
        lineStyle: { opacity: 0 }, symbol: 'none', tooltip: { show: false }, silent: true,
      },
      {
        name: 'Rango habitual (p10 a p90)', type: 'line', stack: 'band',
        data: points.map((point) => Math.max(0, point.departuresHi - point.departuresLo)),
        lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: chartColors.p90Band },
        itemStyle: { color: chartColors.p90Band }, tooltip: { show: false }, markArea: windowAreas,
      },
      {
        name: 'Promedio histórico', type: 'line', data: points.map((point) => point.departuresPred),
        lineStyle: { color: chartColors.p50, type: 'dashed' }, itemStyle: { color: chartColors.p50 }, symbol: 'none',
      },
      {
        name: 'Salidas reales', type: 'bar', data: points.map((point) => point.departuresActual),
        itemStyle: { color: chartColors.actual }, barWidth: '55%',
      },
    ],
  }), [points])
  return <EChart option={option} height={280} ariaLabel="Salidas por hora del día elegido" />
}

// Forecast day: typical day for that weekday from the full-year profile. Not a forecast.
export function TypicalDayChart({ profile }: { profile: ProfileRow[] }) {
  const option = useMemo<EChartsOption>(() => ({
    textStyle: baseTextStyle,
    grid: { left: 44, right: 16, top: 40, bottom: 36 },
    legend: { top: 0, textStyle: { fontSize: 13 } },
    tooltip: { trigger: 'axis', valueFormatter: (value) => (typeof value === 'number' ? value.toFixed(1) : String(value)) },
    xAxis: { type: 'category', data: hours, axisLabel: { interval: 2, fontSize: 12 } },
    yAxis: { type: 'value', name: 'viajes' },
    series: [
      {
        name: 'Salidas promedio', type: 'bar', data: profile.map((row) => row.avgDepartures),
        itemStyle: { color: chartColors.actual }, barWidth: '55%', markArea: windowAreas,
      },
      {
        name: 'Llegadas promedio', type: 'line', data: profile.map((row) => row.avgArrivals),
        lineStyle: { color: chartColors.baseline, width: 2 }, itemStyle: { color: chartColors.baseline }, symbol: 'none',
      },
    ],
  }), [profile])
  return <EChart option={option} height={280} ariaLabel="Día típico de la estación" />
}
