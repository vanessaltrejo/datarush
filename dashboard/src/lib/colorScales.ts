// Citi Bike brand colors: blue #015cab, light blue #73c2fc, orange #f04c25.
// One sequential blue scale for need and one diverging scale (blue and orange) for
// differences. No red against green.

export const needBins = [1, 3, 6, 12, 25, 50]
export const needColors = ['#eaf4fd', '#cde5f8', '#9fcdf2', '#6bb2e6', '#2f8ad0', '#015cab', '#06305a']

export function needColor(value: number): string {
  const index = needBins.findIndex((limit) => value < limit)
  return needColors[index === -1 ? needColors.length - 1 : index]
}

const needLabels = ['menos de 1', '1 a 3', '3 a 6', '6 a 12', '12 a 25', '25 a 50', '50 o más']

export function needLegend(): { label: string, color: string }[] {
  return needColors.map((color, index) => ({ label: needLabels[index], color }))
}

// Difference = actual minus predicted. Orange means the station needed more than predicted.
export const diffBins = [-10, -3, 3, 10]
export const diffColors = ['#015cab', '#73c2fc', '#e5e5e5', '#f9a98f', '#f04c25']

export function diffColor(value: number): string {
  const index = diffBins.findIndex((limit) => value < limit)
  return diffColors[index === -1 ? diffColors.length - 1 : index]
}

export function diffLegend(): { label: string, color: string }[] {
  return [
    { label: '10 o más de sobra', color: diffColors[0] },
    { label: '3 a 10 de sobra', color: diffColors[1] },
    { label: 'casi exacto (±3)', color: diffColors[2] },
    { label: 'faltaron 3 a 10', color: diffColors[3] },
    { label: 'faltaron 10 o más', color: diffColors[4] },
  ]
}

export const inactiveColor = '#b0b0b0'

export const chartColors = {
  actual: '#1f2937',
  p50: '#015cab',
  p90Band: 'rgba(1, 92, 171, 0.16)',
  p90: '#015cab',
  baseline: '#f04c25',
  miss: '#f04c25',
  member: '#015cab',
  casual: '#f04c25',
  dry: '#8c8c8c',
  rain: '#015cab',
}
