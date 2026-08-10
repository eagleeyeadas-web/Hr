import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CalendarOff, Clock, CheckCircle, AlertCircle, History, Calendar, BookOpen, TrendingUp } from 'lucide-react'
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

      // Ensure permission credits ledger is seeded for current month
      await supabase.rpc('ensure_permission_credits', { p_phone: employee.phone })

      // Fetch leaves for this employee
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_phone', employee.phone)
        .order('applied_at', { ascending: false })

      // Fetch comp-off requests for this employee
      const { data: compoffs } = await supabase
        .from('compoff_requests')
        .select('*')
        .eq('employee_phone', employee.phone)

      // Fetch earned leave credits ledger (persistent, carries forward)
      const { data: earnedCredits } = await supabase
        .from('earned_leave_credits')
        .select('credit_month, eligible_days, earned_credits')
        .eq('employee_phone', employee.phone)
        .order('credit_month', { ascending: false })

      // Fetch permission credits ledger
      const { data: permCredits } = await supabase
        .from('permission_credits')
        .select('credit_month, monthly_credit_hours')
        .eq('employee_phone', employee.phone)

      // Fetch current month's work logs
      const currentMonthStr = new Date().toISOString().slice(0, 7)
      const { data: currentMonthLogs } = await supabase
        .from('work_logs')
        .select('work_date')
        .eq('employee_phone', employee.phone)
        .gte('work_date', `${currentMonthStr}-01`)
        .lte('work_date', `${currentMonthStr}-31`)

      const leaveHistoryData = leaves || []
      const thisMonthLogs = currentMonthLogs || []

      // ---- COMP-OFF BALANCE ----
      const compOffEarned = (compoffs || [])
        .filter(r => r.status === 'Approved')
        .reduce((sum, r) => sum + (r.credited_days || 1), 0)
      const compOffUsed = leaveHistoryData
        .filter(r => r.status === 'Approved' && r.leave_type === 'Comp-Off')
        .reduce((sum, r) => sum + (r.total_days || 0), 0)
      const compOffAvailable = Math.max(0, compOffEarned - compOffUsed)

      // Fetch latest employee allocation details
      const { data: latestEmp } = await supabase
        .from('employees')
        .select('leave_allocation, permission_allocation')
        .eq('phone', employee.phone)
        .single()
      
      const baseAllocation = latestEmp?.leave_allocation ?? 0
      const basePermAllocation = latestEmp?.permission_allocation ?? 0

      // ---- EARNED LEAVE BALANCE ----
      const totalEarnedCredits = (earnedCredits || [])
        .reduce((sum, row) => sum + (row.earned_credits || 0), 0)
      const earnedLeaveUsed = leaveHistoryData
        .filter(r => r.status === 'Approved' && r.leave_type === 'Earned Leave')
        .reduce((sum, r) => sum + (r.total_days || 0), 0)
      const earnedLeaveAvailable = Math.max(0, baseAllocation + totalEarnedCredits - earnedLeaveUsed)

      // ---- TOTAL AVAILABLE ----
      const totalAvailableLeave = earnedLeaveAvailable + compOffAvailable

      // ---- PENDING COUNT ----
      const pendingLeaveCount = leaveHistoryData.filter(r => r.status === 'Pending').length

      // ---- CURRENT MONTH PROGRESS ----
      const workedDaysThisMonth = thisMonthLogs.length
      const earnedThisMonth = Math.floor(workedDaysThisMonth / 15)
      const thisMonthLedger = (earnedCredits || []).find(r => r.credit_month === currentMonthStr)

      setLeaveSummary({
        earned_leave_available: earnedLeaveAvailable,
        compoff_available: compOffAvailable,
        total_available: totalAvailableLeave,
        pending: pendingLeaveCount,
        worked_days_this_month: workedDaysThisMonth,
        earned_this_month: thisMonthLedger?.earned_credits ?? earnedThisMonth,
        current_month: currentMonthStr,
      })
      setRecentLeave(leaveHistoryData.slice(0, 4))

      // Fetch permissions for this employee
      const { data: perms } = await supabase
        .from('permission_requests')
        .select('*')
        .eq('employee_phone', employee.phone)
        .order('applied_at', { ascending: false })

      const permHistoryData = perms || []

      const approvedPermMinutes = permHistoryData
        .filter(r => r.status === 'Approved')
        .reduce((sum, r) => sum + (r.duration_minutes || 0), 0)

      const pendingPermCount = permHistoryData.filter(r => r.status === 'Pending').length

      // Calculate permission ledger stats
      const totalPermissionCredits = (permCredits || [])
        .reduce((sum, row) => sum + (row.monthly_credit_hours || 2), 0)
      const approvedPermHours = approvedPermMinutes / 60.0
      const permissionAvailable = Math.max(0, basePermAllocation + totalPermissionCredits - approvedPermHours)

      setPermSummary({
        total: permHistoryData.length,
        pending: pendingPermCount,
        approved_hours: approvedPermHours.toFixed(1),
        available: permissionAvailable.toFixed(1)
      })
      setRecentPerms(permHistoryData.slice(0, 4))

      setLoading(false)
    }
    fetchData()
  }, [employee])

  if (loading || !employee) return <PageLoader />

  const firstName = employee.full_name?.split(' ')[0] || 'there'
  const monthLabel = leaveSummary?.current_month
    ? new Date(leaveSummary.current_month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })
    : ''

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-4 sm:p-6 text-white">
        <p className="text-blue-200 text-sm mb-1">Good day,</p>
        <h1 className="text-xl sm:text-2xl font-bold">Welcome back, {firstName}! 👋</h1>
        {employee.employee_type && (
          <span className={`inline-block mt-2 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
            employee.employee_type === 'Senior' ? 'bg-blue-500/30 text-blue-100' : 'bg-purple-500/30 text-purple-100'
          }`}>{employee.employee_type} Employee</span>
        )}
      </div>

      {/* Leave & Permission Balances — 3 Balances Consolidated */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">Leave & Permission Balances</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Earned Leave Balance"
            value={`${leaveSummary?.earned_leave_available ?? 0} days`}
            icon={BookOpen}
            color="blue"
          />
          <StatCard
            label="Comp-Off Balance"
            value={`${leaveSummary?.compoff_available ?? 0} days`}
            icon={Calendar}
            color="amber"
          />
          <StatCard
            label="Permission Balance"
            value={`${permSummary?.available ?? 0} hours`}
            icon={Clock}
            color="purple"
          />
        </div>
      </div>

      {/* Current Month Progress */}
      <div className="bg-white rounded-xl border border-slate-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-green-500" />
          <h2 className="text-sm font-semibold text-slate-700">This Month's Progress — {monthLabel}</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-slate-800">{leaveSummary?.worked_days_this_month ?? 0}</p>
            <p className="text-xs text-slate-500 mt-1">Worked Days</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-green-700">+{leaveSummary?.earned_this_month ?? 0}</p>
            <p className="text-xs text-slate-500 mt-1">Earned This Month</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-purple-700">+2 hrs</p>
            <p className="text-xs text-slate-500 mt-1">Permission Credit</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 col-span-2 sm:col-span-1">
            <p className="text-sm font-semibold text-slate-600">Next credit at 15 days</p>
            <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((leaveSummary?.worked_days_this_month ?? 0) % 15) / 15 * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {(leaveSummary?.worked_days_this_month ?? 0) % 15} / 15 days toward next credit
            </p>
          </div>
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
        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <QuickAction to="/employee/apply-leave" icon={<CalendarOff size={20} />} label="Apply Leave" color="blue" />
          <QuickAction to="/employee/permission" icon={<Clock size={20} />} label="Request Permission" color="purple" />
          <QuickAction to="/employee/compoff" icon={<Calendar size={20} />} label="Comp-Off Requests" color="amber" />
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
    amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-100',
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
