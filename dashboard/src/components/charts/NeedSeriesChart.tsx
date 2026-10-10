'use client'

import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { EChart, baseTextStyle } from './EChart'
import { chartColors } from '@/lib/colorScales'
import { formatDateShort } from '@/lib/format'
import type { DashboardMode, WindowPrediction } from '@/types/domain'

interface NeedSeriesChartProps {
  series: WindowPrediction[],
  mode: DashboardMode,
  selectedDate: string,
}

// Uncertainty view: typical (p50) to safe (p90) as a band, actual need as a line,
// baseline safe level as a thin dashed line. Orange dots are days above the safe level.
export function NeedSeriesChart({ series, mode, selectedDate }: NeedSeriesChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const dates = series.map((row) => row.date)
    const misses = series
      .filter((row) => row.needActual !== null && row.covered === false)
      .map((row) => [row.date, row.needActual ?? 0])
    return {
      textStyle: baseTextStyle,
      grid: { left: 48, right: 16, top: 40, bottom: 56 },
      legend: {
        top: 0,
        textStyle: { fontSize: 13 },
        data: ['Rango típico a recomendado', 'Recomendado (p90)', 'Día típico (p50)',
          ...(mode === 'backtest' ? ['Real', 'Línea base (p90)', 'Real arriba de lo recomendado'] : [])],
      },
      tooltip: { trigger: 'axis', valueFormatter: (value) => (typeof value === 'number' ? value.toFixed(1) : String(value ?? 'sin dato')) },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { formatter: (value: string) => formatDateShort(value), fontSize: 12 },
      },
      yAxis: { type: 'value', name: 'bicis', nameTextStyle: { fontSize: 12 }, min: 0 },
      series: [
        {
          name: 'base', type: 'line', stack: 'band', data: series.map((row) => row.needP50),
          lineStyle: { opacity: 0 }, symbol: 'none', tooltip: { show: false }, silent: true,
        },
        {
          name: 'Rango típico a recomendado', type: 'line', stack: 'band',
          data: series.map((row) => Math.max(0, row.needP90 - row.needP50)),
          lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: chartColors.p90Band },
          itemStyle: { color: chartColors.p90Band }, tooltip: { show: false },
        },
        {
          name: 'Día típico (p50)', type: 'line', data: series.map((row) => row.needP50),
          lineStyle: { color: chartColors.p50, width: 1.5, type: 'dotted' }, itemStyle: { color: chartColors.p50 }, symbol: 'none',
        },
        {
          name: 'Recomendado (p90)', type: 'line', data: series.map((row) => row.needP90),
          lineStyle: { color: chartColors.p90, width: 2 }, itemStyle: { color: chartColors.p90 }, symbol: 'none',
          markLine: {
            silent: true, symbol: 'none', lineStyle: { color: '#9ca3af', type: 'solid' },
            label: { formatter: 'día elegido', fontSize: 11 }, data: [{ xAxis: selectedDate }],
          },
        },
        ...(mode === 'backtest' ? [
          {
            name: 'Línea base (p90)', type: 'line' as const, data: series.map((row) => row.baselineP90),
            lineStyle: { color: chartColors.baseline, width: 1, type: 'dashed' as const },
            itemStyle: { color: chartColors.baseline }, symbol: 'none',
          },
          {
            name: 'Real', type: 'line' as const, data: series.map((row) => row.needActual),
            lineStyle: { color: chartColors.actual, width: 2 }, itemStyle: { color: chartColors.actual },
            symbol: 'circle', symbolSize: 4,
          },
          {
            name: 'Real arriba de lo recomendado', type: 'scatter' as const, data: misses,
            itemStyle: { color: chartColors.miss }, symbolSize: 10, z: 10,
          },
        ] : []),
      ],
    }
  }, [series, mode, selectedDate])

  return <EChart option={option} height={320} ariaLabel="Necesidad por día con banda de incertidumbre" />
}
