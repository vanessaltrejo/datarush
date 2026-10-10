'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { BacktestView, DashboardData, DashboardMode, NeedLevel, WindowName } from '@/types/domain'
import { datesForMode, topStationKey } from '@/lib/selectors'

interface DashboardState {
  data: DashboardData,
  mode: DashboardMode,
  date: string,
  window: WindowName,
  level: NeedLevel,
  backtestView: BacktestView,
  selectedStationKey: string | null,
  detailOpen: boolean,
  availableDates: string[],
  setMode: (mode: DashboardMode) => void,
  setDate: (date: string) => void,
  setWindow: (window: WindowName) => void,
  setLevel: (level: NeedLevel) => void,
  setBacktestView: (view: BacktestView) => void,
  // Puts a station in focus and opens its detail drawer.
  focusStation: (stationKey: string) => void,
  closeDetail: () => void,
  openDetail: () => void,
}

const DashboardContext = createContext<DashboardState | null>(null)

// Default day: a weekday in the backtest with a clear PM peak (last day of the data).
function defaultDate(dates: string[]): string {
  return dates[dates.length - 1] ?? ''
}

export function DashboardProvider({ data, children }: { data: DashboardData, children: ReactNode }) {
  const [mode, setModeState] = useState<DashboardMode>('backtest')
  const [window, setWindow] = useState<WindowName>('PM')
  const [level, setLevel] = useState<NeedLevel>('p90')
  const [backtestView, setBacktestView] = useState<BacktestView>('predicted')

  const datesByMode = useMemo(() => ({
    backtest: datesForMode(data.predictions, 'backtest'),
    forecast: datesForMode(data.predictions, 'forecast'),
  }), [data.predictions])

  const [date, setDate] = useState<string>(() => defaultDate(datesByMode.backtest))
  // A station is in focus from the start: the one with the highest need on the default day.
  const [selectedStationKey, setSelectedStationKey] = useState<string | null>(
    () => topStationKey(data.predictions, 'backtest', defaultDate(datesByMode.backtest), 'PM', 'p90'),
  )
  const [detailOpen, setDetailOpen] = useState(false)

  const focusStation = useCallback((stationKey: string) => {
    setSelectedStationKey(stationKey)
    setDetailOpen(true)
  }, [])
  const closeDetail = useCallback(() => setDetailOpen(false), [])
  const openDetail = useCallback(() => setDetailOpen(true), [])

  const setMode = useCallback((nextMode: DashboardMode) => {
    setModeState(nextMode)
    const nextDates = datesByMode[nextMode]
    setDate(nextMode === 'forecast' ? nextDates[0] ?? '' : defaultDate(nextDates))
  }, [datesByMode])

  const value = useMemo<DashboardState>(() => ({
    data,
    mode,
    date,
    window,
    level,
    backtestView,
    selectedStationKey,
    detailOpen,
    availableDates: datesByMode[mode],
    setMode,
    setDate,
    setWindow,
    setLevel,
    setBacktestView,
    focusStation,
    closeDetail,
    openDetail,
  }), [data, mode, date, window, level, backtestView, selectedStationKey, detailOpen, datesByMode, setMode, focusStation, closeDetail, openDetail])

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard(): DashboardState {
  const context = useContext(DashboardContext)
  if (!context) throw new Error('useDashboard must be used inside DashboardProvider')
  return context
}
