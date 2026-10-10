import type { ReactNode } from 'react'

export function Card({ title, subtitle, children, className = '' }: {
  title?: string,
  subtitle?: string,
  children: ReactNode,
  className?: string,
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      <div className={title || subtitle ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, hint, tone = 'default' }: {
  label: string,
  value: string,
  hint?: string,
  tone?: 'default' | 'accent' | 'muted',
}) {
  const valueColor = tone === 'accent' ? 'text-brand-800' : tone === 'muted' ? 'text-slate-500' : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-sm text-slate-600">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${valueColor}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export interface SegmentOption<T extends string> {
  value: T,
  label: string,
  hint?: string,
}

export function SegmentedControl<T extends string>({ label, options, value, onChange }: {
  label: string,
  options: SegmentOption<T>[],
  value: T,
  onChange: (value: T) => void,
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={option.hint}
              onClick={() => onChange(option.value)}
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                active ? 'bg-white text-brand-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{children}</p>
}

export function Badge({ children, tone = 'default' }: { children: ReactNode, tone?: 'default' | 'warn' | 'muted' }) {
  const styles = tone === 'warn' ? 'bg-amber-100 text-amber-900'
    : tone === 'muted' ? 'bg-slate-200 text-slate-700' : 'bg-brand-100 text-brand-900'
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles}`}>{children}</span>
}
