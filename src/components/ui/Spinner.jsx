export function Spinner({ size = 'md', className }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8', xl: 'h-12 w-12' }
  return (
    <svg
      className={`animate-spin text-blue-600 ${sizes[size] || ''} ${className || ''}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    </div>
  )
}

export function SkeletonRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 rounded w-full" />
        </td>
      ))}
    </tr>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Icon size={24} className="text-slate-400" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-400 mb-4 max-w-xs">{description}</p>}
      {action}
    </div>
  )
}

export function StatCard({ label, value, icon: Icon, color = 'blue', sub }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-50',    icon: 'text-blue-600',    value: 'text-blue-700' },
    green:  { bg: 'bg-emerald-50', icon: 'text-emerald-600', value: 'text-emerald-700' },
    amber:  { bg: 'bg-amber-50',   icon: 'text-amber-600',   value: 'text-amber-700' },
    red:    { bg: 'bg-red-50',     icon: 'text-red-600',     value: 'text-red-700' },
    purple: { bg: 'bg-purple-50',  icon: 'text-purple-600',  value: 'text-purple-700' },
    slate:  { bg: 'bg-slate-100',  icon: 'text-slate-500',   value: 'text-slate-700' },
  }
  const c = colorMap[color] || colorMap.blue
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5 card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
          <p className={`text-3xl font-bold ${c.value}`}>{value ?? '—'}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-xl ${c.bg}`}>
            <Icon size={20} className={c.icon} />
          </div>
        )}
      </div>
    </div>
  )
}
