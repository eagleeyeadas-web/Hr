import { Bell, Menu } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getInitials } from '../../lib/utils'

export function Header({ title, notifPath, onMenuClick }) {
  const { user, profile, employee } = useAuth()
  const name = employee?.full_name || user?.email || 'User'
  const role = profile?.role || ''

  return (
    <header className="bg-white border-b border-slate-100 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold text-slate-800 truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {/* Notifications bell */}
        {notifPath && (
          <Link
            to={notifPath}
            className="relative p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Notifications"
          >
            <Bell size={18} />
          </Link>
        )}
        {/* Avatar */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
            {getInitials(name)}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-slate-800 leading-none truncate max-w-[120px]">{name}</p>
            <p className="text-[11px] text-slate-400 capitalize mt-0.5">{role}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
