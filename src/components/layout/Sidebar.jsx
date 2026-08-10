import { useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, CalendarOff, Clock, BarChart3,
  Bell, LogOut, Building2, ClipboardList
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/utils'

const HR_NAV = [
  { to: '/hr/dashboard',    label: 'Dashboard',           icon: LayoutDashboard },
  { to: '/hr/employees',    label: 'Employees',           icon: Users },
  { to: '/hr/leave',        label: 'Leave Requests',      icon: CalendarOff },
  { to: '/hr/permissions',  label: 'Permission Requests', icon: Clock },
  { to: '/hr/reports',      label: 'Reports',             icon: BarChart3 },
  { to: '/hr/notifications',label: 'Notifications',       icon: Bell },
]

const EMPLOYEE_NAV = [
  { to: '/employee/dashboard',   label: 'Dashboard',          icon: LayoutDashboard },
  { to: '/employee/apply-leave', label: 'Apply Leave',        icon: CalendarOff },
  { to: '/employee/permission',  label: 'Permission Request', icon: Clock },
  { to: '/employee/my-leave',    label: 'My Leave',           icon: ClipboardList },
  { to: '/employee/my-permissions', label: 'My Permissions',  icon: ClipboardList },
  { to: '/employee/compoff',     label: 'Comp-Off Requests',  icon: ClipboardList },
  { to: '/employee/notifications',  label: 'Notifications',   icon: Bell },
  { to: '/employee/profile',     label: 'Profile',            icon: Users },
]

function SidebarContent({ role, onNavClick }) {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  const navItems = role === 'hr' ? HR_NAV : EMPLOYEE_NAV

  const handleLogout = async () => {
    onNavClick?.()
    await signOut()
    navigate('/login')
  }

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <Building2 size={20} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-sm">HR Portal</p>
          <p className="text-[10px] text-slate-400 capitalize">{profile?.role || 'Loading'}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavClick}
            className={({ isActive }) =>
              cn(
                'sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="sidebar-link w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors"
        >
          <LogOut size={17} />
          Logout
        </button>
      </div>
    </>
  )
}

export function Sidebar({ role, mobileOpen, onMobileClose }) {
  // Close drawer when screen resizes to desktop
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 768) onMobileClose?.()
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [onMobileClose])

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <>
      {/* Desktop sidebar — unchanged layout */}
      <aside className="hidden md:flex flex-col w-64 min-h-screen bg-slate-900 text-white shrink-0">
        <SidebarContent role={role} />
      </aside>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile slide-in drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-slate-900 text-white md:hidden',
          'transform transition-transform duration-200 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent role={role} onNavClick={onMobileClose} />
      </aside>
    </>
  )
}
