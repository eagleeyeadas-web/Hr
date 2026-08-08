import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { LEAVE_TYPES } from '../../lib/utils'
import { StatCard } from '../../components/ui/Spinner'
import { CalendarOff, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Reports() {
  const [filters, setFilters] = useState({ employee_phone: '', year: String(new Date().getFullYear()), month: '' })
  const [employees, setEmployees] = useState([])
  const [leaveStats, setLeaveStats] = useState(null)
  const [permStats, setPermStats] = useState(null)
  const [leaveTypeData, setLeaveTypeData] = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('employees').select('phone, full_name').order('full_name').then(({data}) => setEmployees(data || []))
  }, [])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    let lq = supabase.from('leave_requests').select('*, employees(full_name)')
    let pq = supabase.from('permission_requests').select('*, employees(full_name)')
    if (filters.year) {
      lq = lq.gte('applied_at', `${filters.year}-01-01`).lte('applied_at', `${filters.year}-12-31T23:59:59`)
      pq = pq.gte('applied_at', `${filters.year}-01-01`).lte('applied_at', `${filters.year}-12-31T23:59:59`)
    }
    if (filters.month && filters.year) {
      const m = String(filters.month).padStart(2,'0')
      const days = new Date(filters.year, filters.month, 0).getDate()
      lq = lq.gte('applied_at', `${filters.year}-${m}-01`).lte('applied_at', `${filters.year}-${m}-${days}T23:59:59`)
      pq = pq.gte('applied_at', `${filters.year}-${m}-01`).lte('applied_at', `${filters.year}-${m}-${days}T23:59:59`)
    }
    if (filters.employee_phone) {
      lq = lq.eq('employee_phone', filters.employee_phone)
      pq = pq.eq('employee_phone', filters.employee_phone)
    }
    const { data: ld } = await lq
    const { data: pd } = await pq

    let leaves = ld || []
    let perms = pd || []

    // Leave stats
    const ls = {
      total: leaves.length,
      approved: leaves.filter(r => r.status === 'Approved').length,
      rejected: leaves.filter(r => r.status === 'Rejected').length,
      pending: leaves.filter(r => r.status === 'Pending').length,
      totalDays: leaves.filter(r => r.status === 'Approved').reduce((acc, r) => acc + (r.total_days || 0), 0),
    }
    setLeaveStats(ls)

    // Permission stats
    const approvedMinutes = perms.filter(r => r.status === 'Approved').reduce((acc, r) => acc + (r.duration_minutes || 0), 0)
    const ps = {
      total: perms.length,
      approved: perms.filter(r => r.status === 'Approved').length,
      rejected: perms.filter(r => r.status === 'Rejected').length,
      pending: perms.filter(r => r.status === 'Pending').length,
      totalHours: (approvedMinutes / 60).toFixed(1),
    }
    setPermStats(ps)

    // Leave type distribution
    const typeMap = {}
    LEAVE_TYPES.forEach(t => { typeMap[t] = 0 })
    leaves.filter(r => r.status === 'Approved').forEach(r => { if (typeMap[r.leave_type] !== undefined) typeMap[r.leave_type]++ })
    setLeaveTypeData(Object.entries(typeMap).filter(([,v]) => v > 0).map(([name, value]) => ({ name, value })))

    // Monthly leave trend
    const monthMap = {}
    MONTHS.forEach((m, i) => { monthMap[i + 1] = { month: m, leaves: 0, permissions: 0 } })
    leaves.forEach(r => {
      const m = new Date(r.applied_at).getMonth() + 1
      if (monthMap[m]) monthMap[m].leaves++
    })
    perms.forEach(r => {
      const m = new Date(r.applied_at).getMonth() + 1
      if (monthMap[m]) monthMap[m].permissions++
    })
    setMonthlyData(Object.values(monthMap))
    setLoading(false)
  }, [filters])

  useEffect(() => { fetchReports() }, [fetchReports])

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center">
          <select value={filters.year} onChange={e => setFilters({...filters, year: e.target.value})}
            className="py-2.5 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 text-slate-700 w-full sm:w-auto">
            <option value="">All Years</option>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <select value={filters.month} onChange={e => setFilters({...filters, month: e.target.value})}
            className="py-2.5 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 text-slate-700 w-full sm:w-auto">
            <option value="">All Months</option>
            {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
          </select>
          <select value={filters.employee_phone} onChange={e => setFilters({...filters, employee_phone: e.target.value})}
            className="py-2.5 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 text-slate-700 w-full sm:w-auto sm:min-w-[180px]">
            <option value="">All Employees</option>
            {employees.map(emp => <option key={emp.phone} value={emp.phone}>{emp.full_name}</option>)}
          </select>
          <button onClick={() => setFilters({ employee_phone: '', year: String(new Date().getFullYear()), month: '' })}
            className="text-xs text-blue-600 hover:underline">Reset</button>
        </div>
      </div>

      {/* Leave Report */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Leave Report</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Total Requests" value={leaveStats?.total} icon={CalendarOff} color="blue" />
            <StatCard label="Approved" value={leaveStats?.approved} icon={CheckCircle} color="green" />
            <StatCard label="Rejected" value={leaveStats?.rejected} icon={XCircle} color="red" />
            <StatCard label="Pending" value={leaveStats?.pending} icon={AlertCircle} color="amber" />
            <StatCard label="Total Days" value={leaveStats?.totalDays} icon={CalendarOff} color="purple" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Monthly trend */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Monthly Leave Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="leaves" fill="#3b82f6" radius={[4,4,0,0]} name="Leaves" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Leave type distribution */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Leave Type Distribution</h3>
              {leaveTypeData.length === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-sm text-slate-400">No approved leaves</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={leaveTypeData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" nameKey="name" paddingAngle={3}>
                      {leaveTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Permission Report */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Permission Report</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Total Requests" value={permStats?.total} icon={Clock} color="blue" />
            <StatCard label="Approved" value={permStats?.approved} icon={CheckCircle} color="green" />
            <StatCard label="Rejected" value={permStats?.rejected} icon={XCircle} color="red" />
            <StatCard label="Pending" value={permStats?.pending} icon={AlertCircle} color="amber" />
            <StatCard label="Total Hours" value={`${permStats?.totalHours} hrs`} icon={Clock} color="purple" />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Monthly Permission Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="permissions" fill="#8b5cf6" radius={[4,4,0,0]} name="Permissions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
