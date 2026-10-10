'use client'

import type { ReactNode } from 'react'

export type TabName = 'needs' | 'demand' | 'quality'

interface NavItem {
  value: TabName,
  label: string,
  icon: ReactNode,
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const navItems: NavItem[] = [
  {
    value: 'needs',
    label: 'Necesidad por estación',
    icon: (
      <svg {...iconProps}>
        <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </svg>
    ),
  },
  {
    value: 'demand',
    label: 'Demanda y causas',
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    value: 'quality',
    label: 'Calidad del modelo',
    icon: (
      <svg {...iconProps}>
        <path d="M12 3 4 6v6c0 4.4 3.4 7.7 8 9 4.6-1.3 8-4.6 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
]

interface SidebarProps {
  active: TabName,
  onChange: (tab: TabName) => void,
  collapsed: boolean,
  onToggleCollapsed: () => void,
  onOpenLimits: () => void,
}

// Dark Citi Bike blue. The logo is a PNG with a transparent background, so it works on this color.
export function Sidebar({ active, onChange, collapsed, onToggleCollapsed, onOpenLimits }: SidebarProps) {
  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col bg-brand-sidebar text-white transition-[width] ${
        collapsed ? 'w-[72px]' : 'w-56'}`}
      aria-label="Menú principal"
    >
      {/* Logo */}
      <div className="flex h-20 items-center justify-center border-b border-white/15 px-4">
        {collapsed ? (
          // Only the "citi" part and its red arc fit in the narrow bar.
          <div className="h-[25px] w-[39px] overflow-hidden" title="Citi Bike">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/citibike-logo.png" alt="Citi Bike" className="h-[25px] w-[90px] max-w-none" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/brand/citibike-logo.png" alt="Citi Bike" className="w-[134px]" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        {!collapsed && <div className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-white/60">Panel</div>}
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = item.value === active
            return (
              <li key={item.value}>
                <button
                  type="button"
                  onClick={() => onChange(item.value)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-semibold transition ${
                    collapsed ? 'justify-center' : ''} ${
                    isActive ? 'bg-white text-brand-700' : 'text-white/85 hover:bg-white/10 hover:text-white'}`}
                >
                  {item.icon}
                  {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="my-4 border-t border-white/15" />
        {!collapsed && <div className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-white/60">Información</div>}
        <button
          type="button"
          onClick={onOpenLimits}
          title={collapsed ? 'Límites del análisis' : undefined}
          className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-semibold text-amber-200 transition hover:bg-white/10 ${
            collapsed ? 'justify-center' : ''}`}
        >
          <svg {...iconProps}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.01" />
          </svg>
          {!collapsed && <span className="whitespace-nowrap">Límites del análisis</span>}
        </button>
      </nav>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className={`mx-3 mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-white/75 hover:bg-white/10 hover:text-white ${
          collapsed ? 'justify-center' : ''}`}
        aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
      >
        <svg {...iconProps} width={16} height={16} className={collapsed ? '' : 'rotate-180'}>
          <path d="m9 6 6 6-6 6" />
        </svg>
        {!collapsed && <span>Contraer menú</span>}
      </button>

      {/* Demo account */}
      <div className={`flex items-center gap-3 border-t border-white/15 p-4 ${collapsed ? 'justify-center' : ''}`}>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-700"
          title="Cuenta de demostración"
        >
          AD
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white">Admin demo</div>
            <div className="truncate text-[11px] text-white/70">Cuenta de demostración</div>
          </div>
        )}
      </div>
    </aside>
  )
}
