'use client'

import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { EChart, baseTextStyle } from './EChart'
import { chartColors } from '@/lib/colorScales'
import { weekdayShort } from '@/lib/labels'
import type { UserTypeHour } from '@/types/domain'

const hourLabels = Array.from({ length: 24 }, (_, hour) => `${hour}`)

export function TopStationsChart({ names, values }: { names: string[], values: number[] }) {
  const option = useMemo<EChartsOption>(() => ({
    textStyle: baseTextStyle,
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: [...names].reverse(), axisLabel: { fontSize: 13, width: 220, overflow: 'truncate' } },
    series: [{
      type: 'bar', data: [...values].reverse(), itemStyle: { color: '#015cab' }, barWidth: '65%',
      label: { show: true, position: 'right', fontSize: 12, formatter: ({ value }) => Number(value).toLocaleString('es-MX') },
      name: 'Salidas',
    }],
  }), [names, values])
  return <EChart option={option} height={360} ariaLabel="Estaciones con más salidas en el año" />
}

// Hour (0-23) by weekday heatmap of average departures.
export function DemandHeatmap({ matrix }: { matrix: number[][] }) {
  const option = useMemo<EChartsOption>(() => {
    const cells: [number, number, number][] = []
    let max = 0
    matrix.forEach((row, day) => row.forEach((value, hour) => {
      cells.push([hour, day, Math.round(value * 10) / 10])
      max = Math.max(max, value)
    }))
    return {
      textStyle: baseTextStyle,
      grid: { left: 48, right: 16, top: 8, bottom: 80 },
      tooltip: {
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : params
          const value = item.value
          if (!Array.isArray(value)) return ''
          return `${weekdayShort[Number(value[1])]} ${value[0]}:00<br/>${Number(value[2]).toFixed(1)} salidas por hora`
        },
      },
      xAxis: { type: 'category', data: hourLabels, name: 'hora', nameLocation: 'middle', nameGap: 28, splitArea: { show: true } },
      yAxis: { type: 'category', data: weekdayShort, inverse: true, splitArea: { show: true } },
      visualMap: {
        min: 0, max: Math.max(1, Math.ceil(max)), calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
        inRange: { color: ['#eaf4fd', '#a9d3f5', '#4a9be0', '#015cab', '#06305a'] }, text: ['más', 'menos'],
      },
      series: [{ type: 'heatmap', data: cells, emphasis: { itemStyle: { borderColor: '#111', borderWidth: 1 } } }],
    }
  }, [matrix])
  return <EChart option={option} height={340} ariaLabel="Mapa de calor de salidas por hora y día" />
}

export function UserTypeChart({ byHour }: { byHour: UserTypeHour[] }) {
  const option = useMemo<EChartsOption>(() => ({
    textStyle: baseTextStyle,
    grid: { left: 56, right: 16, top: 40, bottom: 36 },
    legend: { top: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: hourLabels, name: 'hora', nameLocation: 'middle', nameGap: 24 },
    yAxis: { type: 'value', name: 'viajes' },
    series: [
      { name: 'Miembros', type: 'bar', stack: 'users', data: byHour.map((row) => row.member), itemStyle: { color: chartColors.member } },
      { name: 'Ocasionales', type: 'bar', stack: 'users', data: byHour.map((row) => row.casual), itemStyle: { color: chartColors.casual } },
    ],
  }), [byHour])
  return <EChart option={option} height={300} ariaLabel="Viajes por hora y tipo de usuario" />
}
