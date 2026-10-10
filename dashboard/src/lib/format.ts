// Dates stay as text (New York local dates). Never build a Date from 'YYYY-MM-DD' alone.

const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const dayNamesShort = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function dateParts(date: string): { year: number, month: number, day: number } {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

// Day of week computed with UTC math so the local time zone cannot shift it. 0 is Sunday.
export function dayOfWeekSunday(date: string): number {
  const { year, month, day } = dateParts(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

// 0 is Monday, matching profiles.csv.
export function dayOfWeekMonday(date: string): number {
  return (dayOfWeekSunday(date) + 6) % 7
}

export function isWeekend(date: string): boolean {
  return dayOfWeekMonday(date) >= 5
}

export function formatDateShort(date: string): string {
  const { month, day } = dateParts(date)
  return `${day} ${monthNames[month - 1]}`
}

export function formatDateCompact(date: string): string {
  const { month, day } = dateParts(date)
  return `${dayNamesShort[dayOfWeekSunday(date)]} ${day} ${monthNames[month - 1]}`
}

export function formatDateLong(date: string): string {
  const { year, month, day } = dateParts(date)
  return `${dayNames[dayOfWeekSunday(date)]} ${day} ${monthNames[month - 1]} ${year}`
}

const integerFormat = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })
const decimalFormat = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function formatInt(value: number | null): string {
  return value === null ? 'sin dato' : integerFormat.format(value)
}

export function formatOneDecimal(value: number | null): string {
  return value === null ? 'sin dato' : decimalFormat.format(value)
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return 'sin dato'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatSignedPercent(value: number | null): string {
  if (value === null) return 'sin dato'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${decimalFormat.format(value)}`
}
