import { useState, useEffect, useCallback } from 'react'
import { Search, X, CheckCircle, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate, formatTime, formatDuration, LEAVE_TYPES } from '../../lib/utils'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Input'
import { PageLoader, EmptyState, SkeletonRow } from '../../components/ui/Spinner'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

const TABS = [
  { label: 'All Requests', value: 'all' },
  { label: 'Leave', value: 'leave' },
  { label: 'Permissions', value: 'permission' },
  { label: 'Comp-Off', value: 'compoff' },
]

export default function LeaveRequestsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('all')
  const [leaveRequests, setLeaveRequests] = useState([])
  const [permRequests, setPermRequests] = useState([])
  const [compRequests, setCompRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', leaveType: '', month: '', year: '', search: '', company: '' })
  const [selectedReq, setSelectedReq] = useState(null)
  const [selectedType, setSelectedType] = useState(null)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    // Leave requests
    let lq = supabase
      .from('leave_requests')
      .select('*, employees(full_name, company)')
      .order('applied_at', { ascending: false })
    if (filters.status) lq = lq.eq('status', filters.status)
    if (filters.leaveType) lq = lq.eq('leave_type', filters.leaveType)
    if (filters.year) lq = lq.gte('applied_at', `${filters.year}-01-01`).lte('applied_at', `${filters.year}-12-31T23:59:59`)
    if (filters.month && filters.year) {
      const m = filters.month.padStart(2, '0')
      const daysInMonth = new Date(filters.year, filters.month, 0).getDate()
      lq = lq.gte('applied_at', `${filters.year}-${m}-01`).lte('applied_at', `${filters.year}-${m}-${daysInMonth}T23:59:59`)
    }
    const { data: ld } = await lq
    let filtered = ld || []
    if (filters.search) filtered = filtered.filter(r =>
      r.employees?.full_name?.toLowerCase().includes(filters.search.toLowerCase())
    )
    if (filters.company) filtered = filtered.filter(r =>
      r.employees?.company === filters.company
    )
    setLeaveRequests(filtered)

    // Permission requests
    let pq = supabase
      .from('permission_requests')
      .select('*, employees(full_name, company)')
      .order('applied_at', { ascending: false })
    if (filters.status) pq = pq.eq('status', filters.status)
    if (filters.year) pq = pq.gte('applied_at', `${filters.year}-01-01`).lte('applied_at', `${filters.year}-12-31T23:59:59`)
    if (filters.month && filters.year) {
      const m = filters.month.padStart(2, '0')
      const daysInMonth = new Date(filters.year, filters.month, 0).getDate()
      pq = pq.gte('applied_at', `${filters.year}-${m}-01`).lte('applied_at', `${filters.year}-${m}-${daysInMonth}T23:59:59`)
    }
    const { data: pd } = await pq
    let filteredP = pd || []
    if (filters.search) filteredP = filteredP.filter(r =>
      r.employees?.full_name?.toLowerCase().includes(filters.search.toLowerCase())
    )
    if (filters.company) filteredP = filteredP.filter(r =>
      r.employees?.company === filters.company
    )
    setPermRequests(filteredP)

    // Comp-off requests
    let cq = supabase
      .from('compoff_requests')
      .select('*, employees(full_name, company)')
      .order('created_at', { ascending: false })
    if (filters.status) cq = cq.eq('status', filters.status)
    if (filters.year) cq = cq.gte('created_at', `${filters.year}-01-01`).lte('created_at', `${filters.year}-12-31T23:59:59`)
    if (filters.month && filters.year) {
      const m = filters.month.padStart(2, '0')
      const daysInMonth = new Date(filters.year, filters.month, 0).getDate()
      cq = cq.gte('created_at', `${filters.year}-${m}-01`).lte('created_at', `${filters.year}-${m}-${daysInMonth}T23:59:59`)
    }
    const { data: cd } = await cq
    let filteredC = cd || []
    if (filters.search) filteredC = filteredC.filter(r =>
      r.employees?.full_name?.toLowerCase().includes(filters.search.toLowerCase())
    )
    if (filters.company) filteredC = filteredC.filter(r =>
      r.employees?.company === filters.company
    )
    setCompRequests(filteredC)

    setLoading(false)
  }, [filters])

  useEffect(() => { fetchData() }, [fetchData])

  const handleApprove = async () => {
    setActionLoading(true)
    try {
      let table = 'leave_requests'
      if (selectedType === 'permission') table = 'permission_requests'
      if (selectedType === 'compoff') table = 'compoff_requests'

      const { error } = await supabase
        .from(table)
        .update({
          status: 'Approved',
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', selectedReq.id)

      if (error) throw error

      // Create notification for employee
      await supabase.from('notifications').insert({
        employee_phone: selectedReq.employee_phone,
        title: selectedType === 'leave'
          ? 'Leave Approved'
          : selectedType === 'permission'
            ? 'Permission Approved'
            : 'Comp-Off Approved',
        message: selectedType === 'leave'
          ? 'Your leave request has been approved.'
          : selectedType === 'permission'
            ? 'Your permission request has been approved.'
            : `Your Comp-Off request for worked date ${formatDate(selectedReq.worked_date)} has been approved.`,
        type: selectedType,
        related_id: selectedReq.id
      })

      toast.success('Request approved')
      setSelectedReq(null)
      fetchData()
    } catch (err) { toast.error(err.message) }
    finally { setActionLoading(false) }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) { toast.error('Enter rejection reason'); return }
    setActionLoading(true)
    try {
      let table = 'leave_requests'
      if (selectedType === 'permission') table = 'permission_requests'
      if (selectedType === 'compoff') table = 'compoff_requests'

      const { error } = await supabase
        .from(table)
        .update({
          status: 'Rejected',
          rejection_reason: rejectionReason,
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', selectedReq.id)

      if (error) throw error

      // Create notification for employee
      await supabase.from('notifications').insert({
        employee_phone: selectedReq.employee_phone,
        title: selectedType === 'leave'
          ? 'Leave Rejected'
          : selectedType === 'permission'
            ? 'Permission Rejected'
            : 'Comp-Off Rejected',
        message: selectedType === 'leave'
          ? `Your leave request has been rejected. Reason: ${rejectionReason}`
          : selectedType === 'permission'
            ? `Your permission request has been rejected. Reason: ${rejectionReason}`
            : `Your Comp-Off request for worked date ${formatDate(selectedReq.worked_date)} has been rejected. Reason: ${rejectionReason}`,
        type: selectedType,
        related_id: selectedReq.id
      })

      toast.success('Request rejected')
      setSelectedReq(null); setShowRejectForm(false); setRejectionReason('')
      fetchData()
    } catch (err) { toast.error(err.message) }
    finally { setActionLoading(false) }
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const visibleLeave = (tab === 'all' || tab === 'leave') ? leaveRequests : []
  const visiblePerm = (tab === 'all' || tab === 'permission') ? permRequests : []
  const visibleComp = (tab === 'all' || tab === 'compoff') ? compRequests : []

  const clearFilters = () => setFilters({ status: '', leaveType: '', month: '', year: '', search: '', company: '' })

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-max sm:w-fit">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 sm:px-5 py-2 min-h-[44px] sm:min-h-0 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${tab === t.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center">
          <div className="relative flex-1 w-full min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})}
              placeholder="Search employee…"
              className="w-full pl-8 pr-4 py-2.5 min-h-[44px] text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
          </div>
          <div className="flex flex-wrap gap-2 overflow-x-auto">
          <select value={filters.company} onChange={e => setFilters({...filters, company: e.target.value})}
            className="py-2.5 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 text-slate-700 bg-white">
            <option value="">All Companies</option>
            <option value="Aram">Aram</option>
            <option value="Eagle Eye">Eagle Eye</option>
          </select>
          <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}
            className="py-2.5 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 text-slate-700 bg-white">
            <option value="">All Status</option>
            <option>Pending</option><option>Approved</option><option>Rejected</option><option>Cancelled</option>
          </select>

          {tab !== 'permission' && (
            <select value={filters.leaveType} onChange={e => setFilters({...filters, leaveType: e.target.value})}
              className="py-2.5 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 text-slate-700 bg-white">
              <option value="">All Leave Types</option>
              {LEAVE_TYPES.map(l => <option key={l}>{l}</option>)}
            </select>
          )}
          <select value={filters.year} onChange={e => setFilters({...filters, year: e.target.value})}
            className="py-2.5 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 text-slate-700 bg-white">
            <option value="">All Years</option>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
          <select value={filters.month} onChange={e => setFilters({...filters, month: e.target.value})}
            className="py-2.5 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 text-slate-700 bg-white">
            <option value="">All Months</option>
            {months.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
          </select>
          <button onClick={clearFilters} className="min-h-[44px] sm:min-h-0 text-xs text-blue-600 hover:underline flex items-center gap-1 px-2">
            <X size={12} /> Clear
          </button>
          </div>
        </div>
      </div>

      {/* Leave Requests — Mobile Cards */}
      {tab !== 'permission' && (
        <div className="block md:hidden space-y-3">
          <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-800">Leave Requests</h2>
            <span className="text-xs text-slate-400">{visibleLeave.length} record{visibleLeave.length !== 1 ? 's' : ''}</span>
          </div>
          {loading ? (
            Array.from({length:2}).map((_,i) => <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse h-24" />)
          ) : visibleLeave.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 text-center py-10 text-sm text-slate-400">No leave requests found</div>
          ) : visibleLeave.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold text-slate-800">{r.employees?.full_name}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{r.employee_phone}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm text-slate-600">{r.leave_type}</p>
              <p className="text-sm text-slate-500 mt-1">{formatDate(r.start_date)} – {formatDate(r.end_date)} · {r.total_days} day{r.total_days !== 1 ? 's' : ''}</p>
              <p className="text-xs text-slate-400 mt-1">Applied {formatDate(r.applied_at?.split('T')[0])}</p>
              {r.status === 'Pending' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                  <button onClick={() => handleApproveDirectly(r, 'leave')}
                    className="flex-1 min-h-[44px] text-sm font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors">
                    ✓ Approve
                  </button>
                  <button onClick={() => {setSelectedReq(r); setSelectedType('leave'); setShowRejectForm(true); setRejectionReason('')}}
                    className="flex-1 min-h-[44px] text-sm font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors">
                    ✗ Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Leave Requests Table — Desktop */}
      {(tab === 'all' || tab === 'leave') && (
        <div className="hidden md:block bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-800">Leave Requests</h2>
            <span className="text-xs text-slate-400">{visibleLeave.length} record{visibleLeave.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Leave Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Dates</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Days</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Applied On</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? Array.from({length:3}).map((_,i) => <SkeletonRow key={i} cols={7} />) :
                  visibleLeave.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-sm text-slate-400">No leave requests found</td></tr>
                  ) : visibleLeave.map(r => (
                    <tr key={r.id} className="table-row-hover" onClick={() => {setSelectedReq(r); setSelectedType('leave'); setShowRejectForm(false); setRejectionReason('')}}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{r.employees?.full_name}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.leave_type}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(r.start_date)} – {formatDate(r.end_date)}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{r.total_days}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(r.applied_at?.split('T')[0])}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {r.status === 'Pending' && (
                          <div className="flex justify-end gap-1">
                            <button onClick={() => {setSelectedReq(r); setSelectedType('leave'); handleApproveDirectly(r, 'leave')}}
                              className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 transition-colors">✓ Approve</button>
                            <button onClick={() => {setSelectedReq(r); setSelectedType('leave'); setShowRejectForm(false); setRejectionReason('');}}
                              className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors">✗ Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Permission Requests — Mobile Cards */}
      {(tab === 'all' || tab === 'permission') && (
        <div className="block md:hidden space-y-3">
          <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-800">Permission Requests</h2>
            <span className="text-xs text-slate-400">{visiblePerm.length} record{visiblePerm.length !== 1 ? 's' : ''}</span>
          </div>
          {loading ? (
            Array.from({length:2}).map((_,i) => <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse h-24" />)
          ) : visiblePerm.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 text-center py-10 text-sm text-slate-400">No permission requests found</div>
          ) : visiblePerm.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold text-slate-800">{r.employees?.full_name}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{r.employee_phone}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm text-slate-600">{formatDate(r.permission_date)}</p>
              <p className="text-sm text-slate-500 mt-1">{formatTime(r.start_time)} – {formatTime(r.end_time)} · {formatDuration(r.duration_minutes)}</p>
              <p className="text-xs text-slate-400 mt-1 truncate">{r.reason}</p>
              {r.status === 'Pending' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                  <button onClick={() => handleApproveDirectly(r, 'permission')}
                    className="flex-1 min-h-[44px] text-sm font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors">
                    ✓ Approve
                  </button>
                  <button onClick={() => {setSelectedReq(r); setSelectedType('permission'); setShowRejectForm(true); setRejectionReason('')}}
                    className="flex-1 min-h-[44px] text-sm font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors">
                    ✗ Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Permission Requests Table — Desktop */}
      {(tab === 'all' || tab === 'permission') && (
        <div className="hidden md:block bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-800">Permission Requests</h2>
            <span className="text-xs text-slate-400">{visiblePerm.length} record{visiblePerm.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Duration</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reason</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? Array.from({length:3}).map((_,i) => <SkeletonRow key={i} cols={7} />) :
                  visiblePerm.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-sm text-slate-400">No permission requests found</td></tr>
                  ) : visiblePerm.map(r => (
                    <tr key={r.id} className="table-row-hover" onClick={() => {setSelectedReq(r); setSelectedType('permission'); setShowRejectForm(false); setRejectionReason('')}}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{r.employees?.full_name}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.permission_date)}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{formatTime(r.start_time)} – {formatTime(r.end_time)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDuration(r.duration_minutes)}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">{r.reason}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {r.status === 'Pending' && (
                          <div className="flex justify-end gap-1">
                            <button onClick={() => {setSelectedReq(r); setSelectedType('permission'); handleApproveDirectly(r, 'permission')}}
                              className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 transition-colors">✓ Approve</button>
                            <button onClick={() => {setSelectedReq(r); setSelectedType('permission')}}
                              className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors">✗ Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comp-Off Requests — Mobile Cards */}
      {(tab === 'all' || tab === 'compoff') && (
        <div className="block md:hidden space-y-3 mt-6">
          <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-800">Comp-Off Requests</h2>
            <span className="text-xs text-slate-400">{visibleComp.length} record{visibleComp.length !== 1 ? 's' : ''}</span>
          </div>
          {loading ? (
            Array.from({length:2}).map((_,i) => <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse h-24" />)
          ) : visibleComp.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 text-center py-10 text-sm text-slate-400">No comp-off requests found</div>
          ) : visibleComp.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold text-slate-800">{r.employees?.full_name}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{r.employee_phone}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm text-slate-600">Worked Date: {formatDate(r.worked_date)}</p>
              <p className="text-sm text-slate-500 mt-1">Credited Days: {r.credited_days}</p>
              <p className="text-xs text-slate-400 mt-1 truncate">{r.reason}</p>
              {r.status === 'Pending' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                  <button onClick={() => handleApproveDirectly(r, 'compoff')}
                    className="flex-1 min-h-[44px] text-sm font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors">
                    ✓ Approve
                  </button>
                  <button onClick={() => {setSelectedReq(r); setSelectedType('compoff'); setShowRejectForm(true); setRejectionReason('')}}
                    className="flex-1 min-h-[44px] text-sm font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors">
                    ✗ Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Comp-Off Requests Table — Desktop */}
      {(tab === 'all' || tab === 'compoff') && (
        <div className="hidden md:block bg-white rounded-xl border border-slate-100 overflow-hidden mt-6">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-800">Comp-Off Requests</h2>
            <span className="text-xs text-slate-400">{visibleComp.length} record{visibleComp.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Worked Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Credited Days</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reason</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Applied On</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? Array.from({length:3}).map((_,i) => <SkeletonRow key={i} cols={7} />) :
                  visibleComp.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-sm text-slate-400">No comp-off requests found</td></tr>
                  ) : visibleComp.map(r => (
                    <tr key={r.id} className="table-row-hover" onClick={() => {setSelectedReq(r); setSelectedType('compoff'); setShowRejectForm(false); setRejectionReason('')}}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{r.employees?.full_name}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.worked_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{r.credited_days}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate" title={r.reason}>{r.reason}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(r.created_at?.split('T')[0])}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {r.status === 'Pending' && (
                          <div className="flex justify-end gap-1">
                            <button onClick={() => {setSelectedReq(r); setSelectedType('compoff'); handleApproveDirectly(r, 'compoff')}}
                              className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 transition-colors">✓ Approve</button>
                            <button onClick={() => {setSelectedReq(r); setSelectedType('compoff'); setShowRejectForm(false); setRejectionReason('');}}
                              className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors">✗ Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Request Detail / Action Modal */}
      <Modal
        isOpen={!!selectedReq}
        onClose={() => {setSelectedReq(null); setShowRejectForm(false); setRejectionReason('')}}
        title="Request Details"
        size="md"
      >
        {selectedReq && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">Employee</span><span className="font-medium">{selectedReq.employees?.full_name}</span></div>
            </div>
            <div className="text-sm space-y-1.5">
              {selectedType === 'leave' ? (
                <>
                  <InfoRow label="Leave Type" value={selectedReq.leave_type} />
                  <InfoRow label="Start Date" value={formatDate(selectedReq.start_date)} />
                  <InfoRow label="End Date" value={formatDate(selectedReq.end_date)} />
                  <InfoRow label="Total Days" value={selectedReq.total_days} />
                </>
              ) : selectedType === 'permission' ? (
                <>
                  <InfoRow label="Date" value={formatDate(selectedReq.permission_date)} />
                  <InfoRow label="Time" value={`${formatTime(selectedReq.start_time)} – ${formatTime(selectedReq.end_time)}`} />
                  <InfoRow label="Duration" value={formatDuration(selectedReq.duration_minutes)} />
                </>
              ) : (
                <>
                  <InfoRow label="Worked Saturday Date" value={formatDate(selectedReq.worked_date)} />
                  <InfoRow label="Credited Days" value={selectedReq.credited_days} />
                </>
              )}
              <InfoRow label="Reason" value={selectedReq.reason} />
              <InfoRow label="Applied On" value={formatDate(selectedReq.applied_at?.split('T')[0])} />
              <div className="flex justify-between pt-1"><span className="text-slate-500">Status</span><StatusBadge status={selectedReq.status} /></div>
              {selectedReq.rejection_reason && (
                <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
                  <p className="font-medium mb-0.5">Rejection Reason</p>
                  <p>{selectedReq.rejection_reason}</p>
                </div>
              )}
            </div>
            {selectedReq.status === 'Pending' && (
              <div className="pt-2 border-t border-slate-100">
                {showRejectForm ? (
                  <div className="space-y-3">
                    <Textarea label="Rejection Reason *" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Enter reason…" rows={3} />
                    <div className="flex flex-col-reverse sm:flex-row gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setShowRejectForm(false)}>Cancel</Button>
                      <Button variant="danger" size="sm" loading={actionLoading} onClick={handleReject}>Confirm Reject</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="success" loading={actionLoading} onClick={handleApprove}><CheckCircle size={15} /> Approve</Button>
                    <Button variant="danger" onClick={() => setShowRejectForm(true)}><XCircle size={15} /> Reject</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )

  async function handleApproveDirectly(req, type) {
    setActionLoading(true)
    try {
      let table = 'leave_requests'
      if (type === 'permission') table = 'permission_requests'
      if (type === 'compoff') table = 'compoff_requests'

      const { error } = await supabase
        .from(table)
        .update({
          status: 'Approved',
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', req.id)

      if (error) throw error

      // Create notification for employee
      await supabase.from('notifications').insert({
        employee_phone: req.employee_phone,
        title: type === 'leave'
          ? 'Leave Approved'
          : type === 'permission'
            ? 'Permission Approved'
            : 'Comp-Off Approved',
        message: type === 'leave'
          ? 'Your leave request has been approved.'
          : type === 'permission'
            ? 'Your permission request has been approved.'
            : `Your Comp-Off request for worked date ${formatDate(req.worked_date)} has been approved.`,
        type: type,
        related_id: req.id
      })

      toast.success('Request approved')
      setSelectedReq(null)
      fetchData()
    } catch (err) { toast.error(err.message) }
    finally { setActionLoading(false) }
  }
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between border-b border-slate-50 pb-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-700 text-right max-w-[220px]">{value}</span>
    </div>
  )
}
