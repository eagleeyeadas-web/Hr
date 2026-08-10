import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, Calendar, CheckCircle, XCircle, Plus, Trash2, BookOpen } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate, formatTime, formatDuration, getInitials } from '../../lib/utils'
import { StatusBadge } from '../../components/ui/Badge'
import { PageLoader } from '../../components/ui/Spinner'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Input'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'

function SummaryCard({ label, value, color = 'blue' }) {
  const colorMap = {
    blue:   'bg-blue-50 border-blue-100 text-blue-700',
    green:  'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber:  'bg-amber-50 border-amber-100 text-amber-700',
    red:    'bg-red-50 border-red-100 text-red-700',
    slate:  'bg-slate-50 border-slate-100 text-slate-700',
  }
  return (
    <div className={`rounded-xl border px-4 py-3 ${colorMap[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value ?? '—'}</p>
    </div>
  )
}

export default function EmployeeProfile() {
  const { id: employeePhone } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [leaveHistory, setLeaveHistory] = useState([])
  const [leaveSummary, setLeaveSummary] = useState(null)
  const [permHistory, setPermHistory] = useState([])
  const [permSummary, setPermSummary] = useState(null)
  const [workLogs, setWorkLogs] = useState([])
  const [activeTab, setActiveTab] = useState('leave')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [requestType, setRequestType] = useState('leave')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [workLogDate, setWorkLogDate] = useState('')
  const [workLogLoading, setWorkLogLoading] = useState(false)
  const [showAllocModal, setShowAllocModal] = useState(false)
  const [allocInput, setAllocInput] = useState('0')
  const [allocSaving, setAllocSaving] = useState(false)
  const [showPermAllocModal, setShowPermAllocModal] = useState(false)
  const [permAllocInput, setPermAllocInput] = useState('0')
  const [permAllocSaving, setPermAllocSaving] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    const { data: emp } = await supabase.from('employees').select('*').eq('phone', employeePhone).single()
    if (!emp) {
      setEmployee(null)
      setLoading(false)
      return
    }
    setEmployee(emp)

    // Leave history
    const { data: lh } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('employee_phone', employeePhone)
      .order('applied_at', { ascending: false })
    const leaveHistoryData = lh || []
    setLeaveHistory(leaveHistoryData)

    // Fetch comp-off requests
    const { data: compoffs } = await supabase
      .from('compoff_requests')
      .select('*')
      .eq('employee_phone', employeePhone)

    // Fetch earned leave credits ledger
    const { data: earnedCredits } = await supabase
      .from('earned_leave_credits')
      .select('*')
      .eq('employee_phone', employeePhone)
      .order('credit_month', { ascending: false })

    // Ensure permission credits ledger is seeded
    await supabase.rpc('ensure_permission_credits', { p_phone: employeePhone })

    // Fetch permission credits ledger
    const { data: permCredits } = await supabase
      .from('permission_credits')
      .select('*')
      .eq('employee_phone', employeePhone)

    // Fetch work logs
    const { data: wl } = await supabase
      .from('work_logs')
      .select('*')
      .eq('employee_phone', employeePhone)
      .order('work_date', { ascending: false })
    setWorkLogs(wl || [])

    // ---- COMP-OFF BALANCE ----
    const compOffEarned = (compoffs || [])
      .filter(r => r.status === 'Approved')
      .reduce((sum, r) => sum + (r.credited_days || 1), 0)
    const compOffUsed = leaveHistoryData
      .filter(r => r.status === 'Approved' && r.leave_type === 'Comp-Off')
      .reduce((sum, r) => sum + (r.total_days || 0), 0)
    const compOffAvailable = Math.max(0, compOffEarned - compOffUsed)

    // ---- EARNED LEAVE BALANCE ----
    const baseAllocation = emp.leave_allocation ?? 0
    const totalEarnedCredits = (earnedCredits || []).reduce((sum, row) => sum + (row.earned_credits || 0), 0)
    const earnedLeaveUsed = leaveHistoryData
      .filter(r => r.status === 'Approved' && r.leave_type === 'Earned Leave')
      .reduce((sum, r) => sum + (r.total_days || 0), 0)
    const earnedLeaveAvailable = Math.max(0, baseAllocation + totalEarnedCredits - earnedLeaveUsed)

    const pendingLeaveCount = leaveHistoryData.filter(r => r.status === 'Pending').length
    const rejectedLeaveCount = leaveHistoryData.filter(r => r.status === 'Rejected').length

    const totalAvailable = earnedLeaveAvailable + compOffAvailable

    // Update allocInput with current base allocation value
    setAllocInput(String(baseAllocation))

    const basePermAllocation = emp.permission_allocation ?? 0
    setPermAllocInput(String(basePermAllocation))

    // Current month stats
    const currentMonthStr = new Date().toISOString().slice(0, 7)
    const workedLogsThisMonth = (wl || []).filter(w => w.work_date?.startsWith(currentMonthStr)).length
    const thisMonthLedger = (earnedCredits || []).find(r => r.credit_month === currentMonthStr)

    setLeaveSummary({
      base_allocation: baseAllocation,
      earned_leave_available: earnedLeaveAvailable,
      compoff_available: compOffAvailable,
      total_available: totalAvailable,
      pending: pendingLeaveCount,
      rejected: rejectedLeaveCount,
      work_logs_this_month: workedLogsThisMonth,
      earned_this_month: thisMonthLedger?.earned_credits ?? 0,
      earned_credits_history: earnedCredits || []
    })

    // Calculate permission ledger stats
    const totalPermissionCredits = (permCredits || [])
      .reduce((sum, row) => sum + (row.monthly_credit_hours || 2), 0)

    // Permission history
    const { data: ph } = await supabase
      .from('permission_requests')
      .select('*')
      .eq('employee_phone', employeePhone)
      .order('applied_at', { ascending: false })
    const permHistoryData = ph || []
    setPermHistory(permHistoryData)

    // Calculate permission summary metrics client-side
    const approvedPermMinutes = permHistoryData
      .filter(r => r.status === 'Approved')
      .reduce((sum, r) => sum + (r.duration_minutes || 0), 0)
    const pendingPermCount = permHistoryData.filter(r => r.status === 'Pending').length
    const rejectedPermCount = permHistoryData.filter(r => r.status === 'Rejected').length

    const approvedPermHours = approvedPermMinutes / 60.0
    const permissionAvailable = Math.max(0, basePermAllocation + totalPermissionCredits - approvedPermHours)

    setPermSummary({
      total: permHistoryData.length,
      approved: permHistoryData.filter(r => r.status === 'Approved').length,
      rejected: rejectedPermCount,
      pending: pendingPermCount,
      approved_hours: approvedPermHours.toFixed(1),
      total_credits: totalPermissionCredits.toFixed(1),
      base_permission_allocation: basePermAllocation,
      available: permissionAvailable.toFixed(1)
    })

    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [employeePhone])

  const handleUpdatePermAllocation = async () => {
    const val = parseFloat(permAllocInput)
    if (isNaN(val) || val < 0) {
      toast.error('Please enter a valid permission hour credit number.')
      return
    }
    setPermAllocSaving(true)
    try {
      const { error } = await supabase
        .from('employees')
        .update({ permission_allocation: val })
        .eq('phone', employeePhone)
      
      if (error) throw error
      toast.success(`Allocated permission hours updated to ${val} hours!`)
      setShowPermAllocModal(false)
      fetchAll()
    } catch (err) {
      toast.error(err.message || 'Failed to update permission allocation')
    } finally {
      setPermAllocSaving(false)
    }
  }

  const handleUpdateAllocation = async () => {
    const val = parseFloat(allocInput)
    if (isNaN(val) || val < 0) {
      toast.error('Please enter a valid leave allocation credit number.')
      return
    }
    setAllocSaving(true)
    try {
      const { error } = await supabase
        .from('employees')
        .update({ leave_allocation: val })
        .eq('phone', employeePhone)
      
      if (error) throw error
      toast.success(`Allocated leave credit updated to ${val} days!`)
      setShowAllocModal(false)
      fetchAll()
    } catch (err) {
      toast.error(err.message || 'Failed to update allocation')
    } finally {
      setAllocSaving(false)
    }
  }

  const handleAddWorkLog = async () => {
    if (!workLogDate) { toast.error('Please select a date.'); return }
    setWorkLogLoading(true)
    try {
      const { error } = await supabase.from('work_logs').insert({
        employee_phone: employeePhone,
        work_date: workLogDate,
        created_by: user.id
      })
      if (error) {
        if (error.code === '23505') throw new Error('Work log already exists for this date.')
        throw error
      }
      toast.success(`Work log added for ${formatDate(workLogDate)}`)
      setWorkLogDate('')
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setWorkLogLoading(false)
    }
  }

  const handleDeleteWorkLog = async (logId) => {
    setWorkLogLoading(true)
    try {
      const { error } = await supabase.from('work_logs').delete().eq('id', logId)
      if (error) throw error
      toast.success('Work log removed')
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setWorkLogLoading(false)
    }
  }

  const handleApprove = async () => {
    setActionLoading(true)
    try {
      const table = requestType === 'leave' ? 'leave_requests' : 'permission_requests'
      const { error } = await supabase
        .from(table)
        .update({
          status: 'Approved',
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', selectedRequest.id)

      if (error) throw error

      // Create employee notification
      await supabase.from('notifications').insert({
        employee_phone: employee.phone,
        title: requestType === 'leave' ? 'Leave Approved' : 'Permission Approved',
        message: requestType === 'leave'
          ? 'Your leave request has been approved.'
          : 'Your permission request has been approved.',
        type: requestType,
        related_id: selectedRequest.id
      })

      toast.success('Request approved')
      setSelectedRequest(null)
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) { toast.error('Please enter a rejection reason'); return }
    setActionLoading(true)
    try {
      const table = requestType === 'leave' ? 'leave_requests' : 'permission_requests'
      const { error } = await supabase
        .from(table)
        .update({
          status: 'Rejected',
          rejection_reason: rejectionReason,
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', selectedRequest.id)

      if (error) throw error

      // Create employee notification
      await supabase.from('notifications').insert({
        employee_phone: employee.phone,
        title: requestType === 'leave' ? 'Leave Rejected' : 'Permission Rejected',
        message: requestType === 'leave'
          ? `Your leave request has been rejected. Reason: ${rejectionReason}`
          : `Your permission request has been rejected. Reason: ${rejectionReason}`,
        type: requestType,
        related_id: selectedRequest.id
      })

      toast.success('Request rejected')
      setSelectedRequest(null)
      setShowRejectForm(false)
      setRejectionReason('')
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <PageLoader />
  if (!employee) return <div className="text-center py-20 text-slate-500 font-semibold">Employee not found.</div>

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <button onClick={() => navigate('/hr/employees')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
          <ArrowLeft size={16} /> Back to Employees
        </button>
        <div className="bg-white rounded-xl border border-slate-100 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-700 shrink-0">
              {getInitials(employee.full_name)}
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-900">{employee.full_name}</h1>
              <div className="flex flex-wrap gap-3 mt-2 items-center">
                {employee.phone && <span className="flex items-center gap-1.5 text-sm text-slate-500"><Phone size={14} /> {employee.phone}</span>}
                {employee.company && <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">{employee.company}</span>}
                {employee.employee_type && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    employee.employee_type === 'Senior'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>{employee.employee_type}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leave Summary */}
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
              <CalendarIcon /> Leave Summary
            </h2>
            <button
              onClick={() => setShowAllocModal(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors"
            >
              Adjust Allocation
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label="Base Allocation" value={`${leaveSummary?.base_allocation ?? 0} days`} color="slate" />
            <SummaryCard label="Earned Leave Balance" value={`${leaveSummary?.earned_leave_available ?? 0} days`} color="blue" />
            <SummaryCard label="Comp-Off Balance" value={`${leaveSummary?.compoff_available ?? 0} days`} color="amber" />
            <SummaryCard label="Total Available" value={`${leaveSummary?.total_available ?? 0} days`} color="blue" />
            <SummaryCard label="Worked This Month" value={`${leaveSummary?.work_logs_this_month ?? 0} days`} color="green" />
            <SummaryCard label="Earned This Month" value={`+${leaveSummary?.earned_this_month ?? 0} days`} color="green" />
          </div>
        </div>

        {/* Permission Summary */}
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
              <ClockIcon /> Permission Summary
            </h2>
            <button
              onClick={() => setShowPermAllocModal(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors"
            >
              Adjust Allocation
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label="Base Allocation" value={`${permSummary?.base_permission_allocation ?? 0} hrs`} color="slate" />
            <SummaryCard label="Permission Balance" value={`${permSummary?.available ?? 0} hrs`} color="purple" />
            <SummaryCard label="Total Credited" value={`${permSummary?.total_credits ?? 0} hrs`} color="blue" />
            <SummaryCard label="Approved Used" value={`${permSummary?.approved_hours ?? 0} hrs`} color="green" />
            <SummaryCard label="Current Month Credit" value="+2.0 hrs" color="green" />
            <SummaryCard label="Pending Requests" value={permSummary?.pending ?? 0} color="amber" />
          </div>
        </div>
      </div>

      {/* History Tabs */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="flex border-b border-slate-100 overflow-x-auto">
          <button
            onClick={() => setActiveTab('leave')}
            className={`px-6 py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'leave' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Leave History ({leaveHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('permission')}
            className={`px-6 py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'permission' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Permission History ({permHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('worklogs')}
            className={`px-6 py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'worklogs' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Work Logs ({workLogs.length})
          </button>
        </div>

        {activeTab === 'leave' && (
          <>
            {/* Mobile Card View */}
            <div className="block md:hidden divide-y divide-slate-50">
              {leaveHistory.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-400">No leave history</div>
              ) : leaveHistory.map(r => (
                <div
                  key={r.id}
                  className="p-4 active:bg-slate-50"
                  onClick={() => { setSelectedRequest(r); setRequestType('leave'); setShowRejectForm(false); setRejectionReason('') }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-medium text-slate-800">{r.leave_type}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-slate-600">{formatDate(r.start_date)} – {formatDate(r.end_date)}</p>
                  <p className="text-xs text-slate-400 mt-1">{r.total_days} day{r.total_days !== 1 ? 's' : ''} · Applied {formatDate(r.applied_at?.split('T')[0])}</p>
                  {r.status === 'Pending' && (
                    <button className="mt-3 w-full min-h-[44px] text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                      Review Request
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Start Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">End Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Days</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Leave Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Applied On</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leaveHistory.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm text-slate-400">No leave history</td></tr>
                ) : leaveHistory.map(r => (
                  <tr key={r.id} className="table-row-hover" onClick={() => { setSelectedRequest(r); setRequestType('leave'); setShowRejectForm(false); setRejectionReason('') }}>
                    <td className="px-5 py-3 text-slate-700">{formatDate(r.start_date)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(r.end_date)}</td>
                    <td className="px-4 py-3 text-slate-700">{r.total_days}</td>
                    <td className="px-4 py-3 text-slate-600">{r.leave_type}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(r.applied_at?.split('T')[0])}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-5 py-3 text-right">
                      {r.status === 'Pending' && (
                        <span className="text-xs text-blue-600 hover:underline cursor-pointer">Review</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {activeTab === 'permission' && (
          <>
            {/* Mobile Card View */}
            <div className="block md:hidden divide-y divide-slate-50">
              {permHistory.length === 0 ? (
                <div className="text-center py-10 text-sm text-slate-400">No permission history</div>
              ) : permHistory.map(r => (
                <div
                  key={r.id}
                  className="p-4 active:bg-slate-50"
                  onClick={() => { setSelectedRequest(r); setRequestType('permission'); setShowRejectForm(false); setRejectionReason('') }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-medium text-slate-800">{formatDate(r.permission_date)}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-slate-600">{formatTime(r.start_time)} – {formatTime(r.end_time)} · {formatDuration(r.duration_minutes)}</p>
                  <p className="text-xs text-slate-400 mt-1 truncate">{r.reason}</p>
                  {r.status === 'Pending' && (
                    <button className="mt-3 w-full min-h-[44px] text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                      Review Request
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">From</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">To</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Duration</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reason</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Applied On</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {permHistory.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-sm text-slate-400">No permission history</td></tr>
                ) : permHistory.map(r => (
                  <tr key={r.id} className="table-row-hover" onClick={() => { setSelectedRequest(r); setRequestType('permission'); setShowRejectForm(false); setRejectionReason('') }}>
                    <td className="px-5 py-3 text-slate-700">{formatDate(r.permission_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatTime(r.start_time)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatTime(r.end_time)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDuration(r.duration_minutes)}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">{r.reason}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(r.applied_at?.split('T')[0])}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-5 py-3 text-right">
                      {r.status === 'Pending' && (
                        <span className="text-xs text-blue-600 hover:underline cursor-pointer">Review</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {activeTab === 'worklogs' && (
          <div className="p-5 space-y-5">
            {/* Add Work Log Form */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <BookOpen size={15} className="text-blue-500" /> Log a Worked Day
              </h3>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Work Date</label>
                  <input
                    type="date"
                    value={workLogDate}
                    onChange={e => setWorkLogDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <Button size="sm" loading={workLogLoading} onClick={handleAddWorkLog}>
                  <Plus size={14} /> Add Work Log
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Adding a work log automatically recalculates earned leave credits. Formula: <strong>FLOOR(total logged days this month / 15)</strong> = earned leave credits for that month.
              </p>
            </div>

            {/* Earned Leave Credits Ledger */}
            {leaveSummary?.earned_credits_history?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <BookOpen size={15} className="text-green-500" /> Earned Leave Credits Ledger
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-slate-500">Month</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-slate-500">Days Logged</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-slate-500">Earned Credits</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-slate-500">Formula</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {leaveSummary.earned_credits_history.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-800">{row.credit_month}</td>
                          <td className="py-2 px-3 text-slate-600">{row.eligible_days}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">+{row.earned_credits}</span>
                          </td>
                          <td className="py-2 px-3 text-slate-400 text-xs">floor({row.eligible_days} / 15) = {row.earned_credits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Work Logs List */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">All Work Logs ({workLogs.length})</h3>
              {workLogs.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-400">No work logs recorded yet. Use the form above to add worked dates.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-slate-500">Date</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-slate-500">Day</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold uppercase text-slate-500">Month</th>
                        <th className="text-right py-2 px-3 text-xs font-semibold uppercase text-slate-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {workLogs.map(wl => {
                        const d = wl.work_date ? new Date(wl.work_date + 'T00:00:00') : null
                        const dayLabel = d ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] : '—'
                        return (
                          <tr key={wl.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-medium text-slate-800">{formatDate(wl.work_date)}</td>
                            <td className="py-2 px-3 text-slate-500 text-xs">{dayLabel}</td>
                            <td className="py-2 px-3 text-slate-500 text-xs">{wl.work_date?.slice(0, 7)}</td>
                            <td className="py-2 px-3 text-right">
                              <button
                                onClick={() => handleDeleteWorkLog(wl.id)}
                                className="text-red-400 hover:text-red-600 p-1 rounded transition-colors"
                                title="Remove log"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Request Detail Modal */}
      <Modal
        isOpen={!!selectedRequest}
        onClose={() => { setSelectedRequest(null); setShowRejectForm(false); setRejectionReason('') }}
        title="Request Details"
        size="md"
      >
        {selectedRequest && (
          <div className="space-y-4">
            {/* Employee info */}
            <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">Employee</span><span className="font-medium text-slate-800">{employee.full_name}</span></div>
            </div>

            {/* Request info */}
            <div className="text-sm space-y-1.5">
              {requestType === 'leave' ? (
                <>
                  <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Leave Type</span><span className="font-medium text-slate-800">{selectedRequest.leave_type}</span></div>
                  <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Start Date</span><span className="text-slate-700">{formatDate(selectedRequest.start_date)}</span></div>
                  <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-700">{formatDate(selectedRequest.end_date)}</span></div>
                  <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Total Days</span><span className="text-slate-700">{selectedRequest.total_days}</span></div>
                </>
              ) : (
                <>
                  <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Date</span><span className="text-slate-700">{formatDate(selectedRequest.permission_date)}</span></div>
                  <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Time</span><span className="text-slate-700">{formatTime(selectedRequest.start_time)} – {formatTime(selectedRequest.end_time)}</span></div>
                  <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Duration</span><span className="text-slate-700">{formatDuration(selectedRequest.duration_minutes)}</span></div>
                </>
              )}
              <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Reason</span><span className="text-slate-700 text-right max-w-[220px]">{selectedRequest.reason}</span></div>
              <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Applied On</span><span className="text-slate-700">{formatDate(selectedRequest.applied_at?.split('T')[0])}</span></div>
              <div className="flex justify-between pb-1.5"><span className="text-slate-500">Status</span><StatusBadge status={selectedRequest.status} /></div>
              {selectedRequest.rejection_reason && (
                <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
                  <p className="font-medium mb-0.5">Rejection Reason</p>
                  <p>{selectedRequest.rejection_reason}</p>
                </div>
              )}
            </div>

            {/* Actions — only for Pending */}
            {selectedRequest.status === 'Pending' && (
              <div className="pt-2 border-t border-slate-100">
                {showRejectForm ? (
                  <div className="space-y-3">
                    <Textarea
                      label="Rejection Reason *"
                      value={rejectionReason}
                      onChange={e => setRejectionReason(e.target.value)}
                      placeholder="Enter reason for rejection…"
                      rows={3}
                    />
                  <div className="flex flex-col-reverse sm:flex-row gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setShowRejectForm(false)}>Cancel</Button>
                    <Button variant="danger" size="sm" loading={actionLoading} onClick={handleReject}>Confirm Reject</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="success" loading={actionLoading} onClick={handleApprove}>
                      <CheckCircle size={15} /> Approve
                    </Button>
                    <Button variant="danger" onClick={() => setShowRejectForm(true)}>
                      <XCircle size={15} /> Reject
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
      
      {/* Edit Allocation Modal */}
      <Modal
        isOpen={showAllocModal}
        onClose={() => setShowAllocModal(false)}
        title="Adjust Allocated Leave Credit"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Enter the base/one-off leave credit allocation for <span className="font-semibold text-slate-700">{employee?.full_name}</span>. This value is added directly to their Earned Leave balance.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Base Leave Credit Allocation (Days)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={allocInput}
              onChange={e => setAllocInput(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowAllocModal(false)}>Cancel</Button>
            <Button size="sm" loading={allocSaving} onClick={handleUpdateAllocation}>Save Allocation</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Permission Allocation Modal */}
      <Modal
        isOpen={showPermAllocModal}
        onClose={() => setShowPermAllocModal(false)}
        title="Adjust Allocated Permission Hours"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Enter the base/one-off permission hours allocation for <span className="font-semibold text-slate-700">{employee?.full_name}</span>. This value is added directly to their Permission Balance.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Base Permission Allocation (Hours)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={permAllocInput}
              onChange={e => setPermAllocInput(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowPermAllocModal(false)}>Cancel</Button>
            <Button size="sm" loading={permAllocSaving} onClick={handleUpdatePermAllocation}>Save Allocation</Button>
          </div>
        </div>
      </Modal>

    </div>
  )
}

function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  )
}
