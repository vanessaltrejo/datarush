interface LegendProps {
  title: string,
  items: { label: string, color: string }[],
  extra?: { label: string, color: string, dashed?: boolean }[],
}

export function Legend({ title, items, extra = [] }: LegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
      <span className="font-semibold">{title}</span>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="inline-block h-4 w-4 rounded-full border border-slate-500" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
      {extra.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className={`inline-block h-4 w-4 rounded-full border border-slate-400 ${item.dashed ? 'border-dashed' : ''}`}
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}
