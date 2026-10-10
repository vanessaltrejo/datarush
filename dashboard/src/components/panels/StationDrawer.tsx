'use client'

import { useEffect } from 'react'
import { useDashboard } from '@/state/DashboardContext'
import { StationPanel } from './StationPanel'

// Slide-over with the full detail of the station in focus. It opens on top of the page,
// so a click always gives a visible answer, no matter how far down the page is scrolled.
export function StationDrawer() {
  const { detailOpen, selectedStationKey, closeDetail } = useDashboard()
  const isOpen = detailOpen && selectedStationKey !== null

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, closeDetail])

  if (!isOpen || selectedStationKey === null) return null

  return (
    <div className="fixed inset-0 z-[3500] flex justify-end bg-slate-900/40" onClick={closeDetail}>
      <aside
        role="dialog"
        aria-label="Detalle de la estación"
        className="drawer-in h-full w-[min(1040px,94vw)] overflow-y-auto bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <StationPanel stationKey={selectedStationKey} />
      </aside>
    </div>
  )
}
