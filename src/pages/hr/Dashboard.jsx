import { useState, useEffect } from 'react'
import { Users, UserCheck, CalendarOff, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { StatCard } from '../../components/ui/Spinner'
import { PageLoader } from '../../components/ui/Spinner'
import { formatDate, getDateRange } from '../../lib/utils'
import { StatusBadge } from '../../components/ui/Badge'

const DATE_FILTERS = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'All Time', value: 'all' },
]

export default function HRDashboard() {
  const [filter, setFilter] = useState('month')
  const [stats, setStats] = useState(null)
  const [recentLeave, setRecentLeave] = useState([])
  const [recentPermissions, setRecentPermissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [filter])

  const fetchStats = async () => {
    setLoading(true)
    const { start, end } = getDateRange(filter)

    try {
      // Total employees count
      const { count: totalEmployees } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: true })

      // Leaves summary
      let leaveQ = supabase.from('leave_requests').select('*', { count: 'exact', head: true })
      if (start) leaveQ = leaveQ.gte('applied_at', start)
      if (end) leaveQ = leaveQ.lte('applied_at', end + 'T23:59:59')

      const { count: pendingLeave } = await leaveQ.eq('status', 'Pending')

      let leaveQ2 = supabase.from('leave_requests').select('*', { count: 'exact', head: true })
      if (start) leaveQ2 = leaveQ2.gte('applied_at', start)
      if (end) leaveQ2 = leaveQ2.lte('applied_at', end + 'T23:59:59')
      const { count: approvedLeave } = await leaveQ2.eq('status', 'Approved')

      let leaveQ3 = supabase.from('leave_requests').select('*', { count: 'exact', head: true })
      if (start) leaveQ3 = leaveQ3.gte('applied_at', start)
      if (end) leaveQ3 = leaveQ3.lte('applied_at', end + 'T23:59:59')
      const { count: rejectedLeave } = await leaveQ3.eq('status', 'Rejected')

      // Permissions
      let permQ = supabase.from('permission_requests').select('*', { count: 'exact', head: true })
      if (start) permQ = permQ.gte('applied_at', start)
      if (end) permQ = permQ.lte('applied_at', end + 'T23:59:59')
      const { count: pendingPerm } = await permQ.eq('status', 'Pending')

      let permQ2 = supabase.from('permission_requests').select('*', { count: 'exact', head: true })
      if (start) permQ2 = permQ2.gte('applied_at', start)
      if (end) permQ2 = permQ2.lte('applied_at', end + 'T23:59:59')
      const { count: approvedPerm } = await permQ2.eq('status', 'Approved')

      const totalRequests = (pendingLeave || 0) + (approvedLeave || 0) + (rejectedLeave || 0) + (pendingPerm || 0) + (approvedPerm || 0)

      setStats({
        totalEmployees,
        totalRequests,
        pendingLeave,
        approvedLeave,
        rejectedLeave,
        pendingPerm,
        approvedPerm,
      })

      // Recent leave requests
      let recent = supabase
        .from('leave_requests')
        .select('*, employees(full_name)')
        .order('applied_at', { ascending: false })
        .limit(5)
      if (start) recent = recent.gte('applied_at', start)
      const { data: recentL } = await recent
      setRecentLeave(recentL || [])

      // Recent permission requests
      let recentP = supabase
        .from('permission_requests')
        .select('*, employees(full_name)')
        .order('applied_at', { ascending: false })
        .limit(5)
      if (start) recentP = recentP.gte('applied_at', start)
      const { data: recentPerm } = await recentP
      setRecentPermissions(recentPerm || [])

    } finally {
      setLoading(false)
    }
  }

  if (loading && !stats) return <PageLoader />

  return (
    <div className="space-y-6">
      {/* Date Filter */}
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        <div className="flex gap-2 w-max sm:w-auto sm:flex-wrap pb-1">
          {DATE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                filter === f.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Employees" value={stats?.totalEmployees ?? '—'} icon={Users} color="blue" />
        <StatCard label="Total Requests" value={stats?.totalRequests ?? '—'} icon={UserCheck} color="green" />
        <StatCard label="Pending Leaves" value={stats?.pendingLeave ?? '—'} icon={CalendarOff} color="amber" />
        <StatCard label="Pending Permissions" value={stats?.pendingPerm ?? '—'} icon={Clock} color="purple" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Approved Leaves" value={stats?.approvedLeave ?? '—'} icon={CheckCircle} color="green" />
        <StatCard label="Approved Permissions" value={stats?.approvedPerm ?? '—'} icon={CheckCircle} color="green" />
        <StatCard label="Rejected Requests" value={(stats?.rejectedLeave ?? 0)} icon={XCircle} color="red" />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Leave */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-800">Recent Leave Requests</h2>
            <a href="/hr/leave" className="text-xs text-blue-600 hover:underline">View all</a>
          </div>
          {recentLeave.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No leave requests</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentLeave.map(r => (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{r.employees?.full_name}</p>
                    <p className="text-xs text-slate-400">{r.leave_type} · {r.total_days} day{r.total_days !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={r.status} />
                    <p className="text-[11px] text-slate-400 mt-1">{formatDate(r.applied_at?.split('T')[0])}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Permissions */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-800">Recent Permission Requests</h2>
            <a href="/hr/permissions" className="text-xs text-blue-600 hover:underline">View all</a>
          </div>
          {recentPermissions.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No permission requests</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentPermissions.map(r => (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{r.employees?.full_name}</p>
                    <p className="text-xs text-slate-400">{formatDate(r.permission_date)} · {Math.round(r.duration_minutes / 60 * 10) / 10} hr</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={r.status} />
                    <p className="text-[11px] text-slate-400 mt-1">{formatDate(r.applied_at?.split('T')[0])}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
