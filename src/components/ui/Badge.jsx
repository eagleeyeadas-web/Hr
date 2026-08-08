import { cn } from '../../lib/utils'

const statusMap = {
  Pending:   { label: 'Pending',   className: 'badge-pending',   dot: 'bg-amber-400' },
  Approved:  { label: 'Approved',  className: 'badge-approved',  dot: 'bg-emerald-500' },
  Rejected:  { label: 'Rejected',  className: 'badge-rejected',  dot: 'bg-red-500' },
  Cancelled: { label: 'Cancelled', className: 'badge-cancelled', dot: 'bg-slate-400' },
}

export function StatusBadge({ status, className }) {
  const config = statusMap[status] || { label: status, className: 'badge-cancelled', dot: 'bg-slate-400' }
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium', config.className, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  )
}

const colorMap = {
  blue:    'bg-blue-50 text-blue-700 border-blue-200',
  green:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  red:     'bg-red-50 text-red-700 border-red-200',
  slate:   'bg-slate-50 text-slate-700 border-slate-200',
  purple:  'bg-purple-50 text-purple-700 border-purple-200',
}

export function Badge({ color = 'slate', children, className }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border', colorMap[color], className)}>
      {children}
    </span>
  )
}
