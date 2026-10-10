'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

interface FullscreenFrameProps {
  title: string,
  subtitle: string,
  footer: ReactNode,
  children: (expanded: boolean) => ReactNode,
}

// Wraps a map and its legend and adds a full screen button in the bottom right corner.
// It asks the browser for real full screen. The fixed layout also works if the browser refuses.
export function FullscreenFrame({ title, subtitle, footer, children }: FullscreenFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)

  const close = useCallback(() => {
    setExpanded(false)
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  const open = useCallback(() => {
    setExpanded(true)
    frameRef.current?.requestFullscreen().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!expanded) return
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setExpanded(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded, close])

  const label = expanded ? 'Salir de pantalla completa' : 'Pantalla completa'

  return (
    <div
      ref={frameRef}
      className={expanded ? 'fixed inset-0 z-[3000] flex flex-col gap-3 bg-white p-5' : 'flex min-h-0 flex-1 flex-col'}
    >
      {expanded && (
        <div>
          <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {children(expanded)}
        <button
          type="button"
          onClick={expanded ? close : open}
          title={label}
          aria-label={label}
          className="absolute bottom-8 right-3 z-[1100] flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-md transition hover:bg-slate-100"
        >
          {expanded ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3M15 21v-4a2 2 0 0 1 2-2h4" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9V5a2 2 0 0 1 2-2h4M21 9V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 1-2 2h-4" />
            </svg>
          )}
        </button>
      </div>

      <div className={expanded ? '' : 'mt-3'}>{footer}</div>
    </div>
  )
}
