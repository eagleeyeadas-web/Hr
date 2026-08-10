import { cn } from '../../lib/utils'

const inputBase = cn(
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base sm:text-sm text-slate-900',
  'min-h-[44px]',
  'placeholder:text-slate-400 transition-colors duration-150',
  'focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none',
  'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed'
)

export function Input({ label, error, className, labelClassName, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className={cn('text-sm font-medium text-slate-700', labelClassName)}>
          {label}
        </label>
      )}
      <input
        className={cn(
          inputBase,
          error && 'border-red-400 focus:border-red-400 focus:ring-red-100',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function Select({ label, error, className, labelClassName, children, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className={cn('text-sm font-medium text-slate-700', labelClassName)}>
          {label}
        </label>
      )}
      <select
        className={cn(
          inputBase,
          error && 'border-red-400 focus:border-red-400 focus:ring-red-100',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, className, labelClassName, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className={cn('text-sm font-medium text-slate-700', labelClassName)}>
          {label}
        </label>
      )}
      <textarea
        className={cn(
          'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-base sm:text-sm text-slate-900',
          'placeholder:text-slate-400 transition-colors duration-150 resize-none',
          'focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none',
          error && 'border-red-400 focus:border-red-400 focus:ring-red-100',
          className
        )}
        rows={4}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
