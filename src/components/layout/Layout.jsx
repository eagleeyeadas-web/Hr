import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAuth } from '../../context/AuthContext'
import { registerPushNotifications } from '../../lib/push'

const HR_TITLES = {
  '/hr/dashboard':     'Dashboard',
  '/hr/employees':     'Employee Management',
  '/hr/leave':         'Leave Requests',
  '/hr/permissions':   'Permission Requests',
  '/hr/reports':       'Reports & Analytics',
  '/hr/notifications': 'Notifications',
}

export function HRLayout() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const title = HR_TITLES[pathname] ||
    (pathname.startsWith('/hr/employees/') ? 'Employee Profile' : 'HR Portal')

  useEffect(() => {
    if (user?.id) {
      registerPushNotifications(user.id, null)
    }
  }, [user])

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="flex min-h-screen">
      <Sidebar role="hr" mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} notifPath="/hr/notifications" onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-3 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const EMP_TITLES = {
  '/employee/dashboard':    'My Dashboard',
  '/employee/apply-leave':  'Apply for Leave',
  '/employee/permission':   'Permission Request',
  '/employee/my-leave':     'My Leave Requests',
  '/employee/my-permissions': 'My Permission Requests',
  '/employee/notifications': 'Notifications',
  '/employee/profile':      'My Profile',
}

export function EmployeeLayout() {
  const { pathname } = useLocation()
  const { employee } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const title = EMP_TITLES[pathname] || 'Employee Portal'

  useEffect(() => {
    if (employee?.phone) {
      registerPushNotifications(null, employee.phone)
    }
  }, [employee])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="flex min-h-screen">
      <Sidebar role="employee" mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} notifPath="/employee/notifications" onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-3 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
