'use client'

const limits = [
  'La recomendación supone que la estación empieza la ventana balanceada. No hay datos de inventario en vivo.',
  'La demanda está censurada. Si una estación se quedó vacía, los viajes que no pasaron no están en los datos. Las cifras son un piso. La necesidad real es igual o mayor.',
  'No conocemos la capacidad de anclajes. Grove St PATH puede necesitar cerca de 100 bicis, pero no sabemos si caben. Por eso el siguiente paso es el feed GBFS.',
  'El modelo predice el riesgo de estación vacía. No predice el riesgo de estación llena. "Se llena" es una tendencia del flujo neto pasado, no una predicción.',
  'Faltan las llegadas que vienen de fuera de las 114 estaciones (menos del 1% de los viajes).',
  'Los días del pronóstico (10 a 17 oct) no se pueden verificar. La calidad del modelo viene de la validación de julio, agosto y septiembre.',
  'Las métricas describen solo temporada alta (julio a septiembre).',
  'Siguiente paso: conectar el feed en vivo GBFS de Citi Bike para tener inventario y capacidad por estación.',
]

export function LimitsDrawer({ open, onClose }: { open: boolean, onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[2000] flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Límites del análisis"
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Límites del análisis</h2>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1 text-slate-600 hover:bg-slate-100">
            Cerrar
          </button>
        </div>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-base text-slate-700">
          {limits.map((limit) => <li key={limit}>{limit}</li>)}
        </ol>
      </aside>
    </div>
  )
}
