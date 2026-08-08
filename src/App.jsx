import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PageLoader } from './components/ui/Spinner'

// Layouts
import { HRLayout, EmployeeLayout } from './components/layout/Layout'

// Auth
import LoginPage from './pages/auth/LoginPage'
import SignupPage from './pages/auth/SignupPage'

// HR Pages
import HRDashboard from './pages/hr/Dashboard'
import Employees from './pages/hr/Employees'
import EmployeeProfile from './pages/hr/EmployeeProfile'
import LeaveRequests from './pages/hr/LeaveRequests'
import Reports from './pages/hr/Reports'
import HRNotifications from './pages/hr/Notifications'

// Employee Pages
import EmployeeDashboard from './pages/employee/Dashboard'
import ApplyLeave from './pages/employee/ApplyLeave'
import PermissionRequest from './pages/employee/PermissionRequest'
import MyLeave from './pages/employee/MyLeave'
import MyPermissions from './pages/employee/MyPermissions'
import EmployeeProfilePage from './pages/employee/Profile'
import EmployeeNotifications from './pages/hr/Notifications' // Reused

// ─── Route Guards ────────────────────────────────────────────────────────────

function AuthRedirect() {
  const { user, profile, employee, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user && !employee) return <Navigate to="/login" replace />
  if (profile?.role === 'admin' || profile?.role === 'hr') {
    return <Navigate to="/hr/dashboard" replace />
  }
  return <Navigate to="/employee/dashboard" replace />
}

function HRRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (profile && profile.role !== 'admin' && profile.role !== 'hr') {
    return <Navigate to="/login" replace />
  }
  return children
}

function EmployeeRoute({ children }) {
  const { user, profile, employee, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user && !employee) return <Navigate to="/login" replace />
  if (profile && profile.role !== 'employee') {
    return <Navigate to="/login" replace />
  }
  return children
}

// ─── App ─────────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/" element={<AuthRedirect />} />

      {/* HR Routes */}
      <Route
        path="/hr"
        element={<HRRoute><HRLayout /></HRRoute>}
      >
        <Route index element={<Navigate to="/hr/dashboard" replace />} />
        <Route path="dashboard" element={<HRDashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="employees/:id" element={<EmployeeProfile />} />
        <Route path="leave" element={<LeaveRequests />} />
        <Route path="permissions" element={<LeaveRequests />} />
        <Route path="reports" element={<Reports />} />
        <Route path="notifications" element={<HRNotifications />} />
      </Route>

      {/* Employee Routes */}
      <Route
        path="/employee"
        element={<EmployeeRoute><EmployeeLayout /></EmployeeRoute>}
      >
        <Route index element={<Navigate to="/employee/dashboard" replace />} />
        <Route path="dashboard" element={<EmployeeDashboard />} />
        <Route path="apply-leave" element={<ApplyLeave />} />
        <Route path="permission" element={<PermissionRequest />} />
        <Route path="my-leave" element={<MyLeave />} />
        <Route path="my-permissions" element={<MyPermissions />} />
        <Route path="profile" element={<EmployeeProfilePage />} />
        <Route path="notifications" element={<EmployeeNotifications />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontSize: '13px',
              borderRadius: '10px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
