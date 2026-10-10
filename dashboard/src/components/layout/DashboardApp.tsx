'use client'

import { useEffect, useState } from 'react'
import { loadDashboardData } from '@/services/dataService'
import { DashboardProvider } from '@/state/DashboardContext'
import type { DashboardData } from '@/types/domain'
import { LimitsDrawer } from './LimitsDrawer'
import { Sidebar, type TabName } from './Sidebar'
import { NeedMapSection } from '@/components/panels/NeedMapSection'
import { StationDrawer } from '@/components/panels/StationDrawer'
import { DemandTab } from '@/components/panels/DemandTab'
import { ModelQualityTab } from '@/components/panels/ModelQualityTab'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready', data: DashboardData }
  | { status: 'error', message: string }

export function DashboardApp() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadDashboardData()
      .then((data) => { if (!cancelled) setState({ status: 'ready', data }) })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : 'Error' })
      })
    return () => { cancelled = true }
  }, [])

  if (state.status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-lg text-slate-500">Cargando datos...</div>
  }
  if (state.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="rounded-xl bg-amber-50 p-6 text-amber-900">No se pudieron cargar los datos. {state.message}</p>
      </div>
    )
  }
  return (
    <DashboardProvider data={state.data}>
      <DashboardShell />
    </DashboardProvider>
  )
}

// On narrower screens the menu starts as a thin bar so the controls fit on one line.
function initialCollapsed(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 1700
}

function DashboardShell() {
  const [tab, setTab] = useState<TabName>('needs')
  const [limitsOpen, setLimitsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        active={tab}
        onChange={setTab}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        onOpenLimits={() => setLimitsOpen(true)}
      />

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-gradient-to-r from-brand-50 via-white to-white">
          <div className="flex items-center gap-4 px-4 py-3 sm:px-6">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white sm:flex">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="5.5" cy="17.5" r="3.5" />
                <circle cx="18.5" cy="17.5" r="3.5" />
                <circle cx="15" cy="5" r="1" />
                <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-2xl font-bold text-slate-900">Bicis necesarias por estación</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
                    <circle cx="12" cy="9.5" r="2.5" />
                  </svg>
                  Área metropolitana de Nueva York (Jersey City y Hoboken)
                </span>
              </div>
              <p className="mt-1 text-[15px] text-slate-600 xl:whitespace-nowrap">
                ¿Qué estaciones se van a quedar sin bicis y cuántas bicis deben tener antes de las horas pico?
              </p>
            </div>
          </div>
        </header>

        <main className="flex flex-col gap-4 px-4 py-6 sm:px-6">
          {tab === 'needs' && (
            <NeedMapSection />
          )}
          {tab === 'demand' && <DemandTab />}
          {tab === 'quality' && <ModelQualityTab />}
        </main>

        <footer className="px-4 pb-8 text-xs text-slate-500 sm:px-6">
          Datos: Citi Bike Trip Histories (oct 2025 a sep 2026), clima de Open-Meteo. Modelo: LightGBM de cuantiles con clima.
          Todos los números vienen de los archivos del repositorio. Nada se calcula en vivo contra un servidor.
        </footer>
      </div>

      <LimitsDrawer open={limitsOpen} onClose={() => setLimitsOpen(false)} />
      <StationDrawer />
    </div>
  )
}
