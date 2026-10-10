'use client'

import dynamic from 'next/dynamic'

// Leaflet needs the browser, so the map loads only on the client.
export const ClientMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl bg-slate-100 text-slate-500">
      Cargando mapa...
    </div>
  ),
})
