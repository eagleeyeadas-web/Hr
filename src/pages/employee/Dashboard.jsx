import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CalendarOff, Clock, CheckCircle, AlertCircle, Plus, History } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { StatCard, PageLoader } from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/Badge'
import { formatDate, formatTime, formatDuration } from '../../lib/utils'

export default function EmployeeDashboard() {
  const { employee } = useAuth()
  const [leaveSummary, setLeaveSummary] = useState(null)
  const [permSummary, setPermSummary] = useState(null)
  const [recentLeave, setRecentLeave] = useState([])
  const [recentPerms, setRecentPerms] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!employee) return
    const fetchData = async () => {
      setLoading(true)

      // Fetch leaves for this employee
      const { data: leaves, error: leavesErr } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_phone', employee.phone)
        .order('applied_at', { ascending: false })

      const leaveHistoryData = leaves || []

      // Calculate current month approved leave days
      const currentMonthStr = new Date().toISOString().slice(0, 7)
      const approvedLeaveDaysThisMonth = leaveHistoryData
        .filter(r => r.status === 'Approved' && (r.start_date?.startsWith(currentMonthStr) || r.applied_at?.startsWith(currentMonthStr)))
        .reduce((sum, r) => sum + (r.total_days || 0), 0)

      const pendingLeaveCount = leaveHistoryData.filter(r => r.status === 'Pending').length

      const localAlloc = localStorage.getItem('leave_alloc_' + employee.phone)
      const alloc = employee.leave_allocation ?? (localAlloc ? parseFloat(localAlloc) : 1)

      setLeaveSummary({
        allocation: alloc,
        used: approvedLeaveDaysThisMonth,
        remaining: Math.max(0, alloc - approvedLeaveDaysThisMonth),
        pending: pendingLeaveCount
      })
      setRecentLeave(leaveHistoryData.slice(0, 4))

      // Fetch permissions for this employee
      const { data: perms, error: permsErr } = await supabase
        .from('permission_requests')
        .select('*')
        .eq('employee_phone', employee.phone)
        .order('applied_at', { ascending: false })

      const permHistoryData = perms || []

      // Calculate permission statistics client-side
      const approvedPermMinutes = permHistoryData
        .filter(r => r.status === 'Approved')
        .reduce((sum, r) => sum + (r.duration_minutes || 0), 0)

      const pendingPermCount = permHistoryData.filter(r => r.status === 'Pending').length

      setPermSummary({
        total: permHistoryData.length,
        pending: pendingPermCount,
        approved_hours: (approvedPermMinutes / 60).toFixed(1)
      })
      setRecentPerms(permHistoryData.slice(0, 4))

      setLoading(false)
    }
    fetchData()
  }, [employee])

  if (loading || !employee) return <PageLoader />

  const firstName = employee.full_name?.split(' ')[0] || 'there'

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-4 sm:p-6 text-white">
        <p className="text-blue-200 text-sm mb-1">Good day,</p>
        <h1 className="text-xl sm:text-2xl font-bold">Welcome back, {firstName}! 👋</h1>
      </div>

      {/* Leave Summary Cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wide">Monthly Leave Balance</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Monthly Allocation" value={`${leaveSummary?.allocation ?? 0} days/mo`} icon={CalendarOff} color="blue" />
          <StatCard label="Used (This Month)" value={`${leaveSummary?.used ?? 0} days`} icon={CheckCircle} color="green" />
          <StatCard label="Remaining (This Month)" value={`${leaveSummary?.remaining ?? 0} days`} icon={CalendarOff} color="amber" />
          <StatCard label="Pending Requests" value={leaveSummary?.pending ?? 0} icon={AlertCircle} color="slate" />
        </div>
      </div>

      {/* Permission Summary Cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wide">Permissions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="Total Permissions" value={permSummary?.total ?? 0} icon={Clock} color="blue" />
          <StatCard label="Pending Requests" value={permSummary?.pending ?? 0} icon={AlertCircle} color="amber" />
          <StatCard label="Approved Hours" value={`${permSummary?.approved_hours ?? 0} hrs`} icon={Clock} color="green" />
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wide">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction to="/employee/apply-leave" icon={<CalendarOff size={20} />} label="Apply Leave" color="blue" />
          <QuickAction to="/employee/permission" icon={<Clock size={20} />} label="Request Permission" color="purple" />
          <QuickAction to="/employee/my-leave" icon={<History size={20} />} label="Leave History" color="slate" />
          <QuickAction to="/employee/my-permissions" icon={<History size={20} />} label="Permission History" color="slate" />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RecentPanel title="Recent Leave Requests" items={recentLeave} renderItem={r => (
          <div key={r.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
            <div>
              <p className="text-sm font-medium text-slate-700">{r.leave_type}</p>
              <p className="text-xs text-slate-400">{formatDate(r.start_date)} – {formatDate(r.end_date)} · {r.total_days} days</p>
            </div>
            <StatusBadge status={r.status} />
          </div>
        )} viewAllTo="/employee/my-leave" />

        <RecentPanel title="Recent Permission Requests" items={recentPerms} renderItem={r => (
          <div key={r.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
            <div>
              <p className="text-sm font-medium text-slate-700">{formatDate(r.permission_date)}</p>
              <p className="text-xs text-slate-400">{formatTime(r.start_time)} – {formatTime(r.end_time)} · {formatDuration(r.duration_minutes)}</p>
            </div>
            <StatusBadge status={r.status} />
          </div>
        )} viewAllTo="/employee/my-permissions" />
      </div>
    </div>
  )
}

function QuickAction({ to, icon, label, color }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100',
    purple: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-100',
    slate: 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-100',
  }
  return (
    <Link to={to} className={`flex flex-col items-center gap-2 p-4 sm:p-5 min-h-[88px] rounded-xl border card-hover transition-colors ${colorMap[color]}`}>
      {icon}
      <span className="text-xs sm:text-sm font-medium text-center leading-tight">{label}</span>
    </Link>
  )
}

function RecentPanel({ title, items, renderItem, viewAllTo }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <Link to={viewAllTo} className="text-xs text-blue-600 hover:underline">View all</Link>
      </div>
      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">No records yet</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {items.map(item => renderItem(item))}
        </div>
      )}
    </div>
  )
}
