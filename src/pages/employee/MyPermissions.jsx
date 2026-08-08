import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatTime, formatDuration } from '../../lib/utils'
import { StatusBadge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { PageLoader, EmptyState } from '../../components/ui/Spinner'
import { Clock, X } from 'lucide-react'
import toast from 'react-hot-toast'

export default function MyPermissions() {
  const { employee } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  const fetchRequests = async () => {
    setLoading(true)
    let q = supabase.from('permission_requests').select('*').eq('employee_phone', employee.phone).order('applied_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data } = await q
    setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => { if (employee) fetchRequests() }, [employee, statusFilter])

  const handleCancel = async () => {
    setCancelling(true)
    const { error } = await supabase.from('permission_requests').update({ status: 'Cancelled' }).eq('id', selected.id).eq('status', 'Pending')
    if (error) toast.error('Failed to cancel')
    else { toast.success('Cancelled'); setSelected(null); fetchRequests() }
    setCancelling(false)
  }

  if (loading && !requests.length) return <PageLoader />

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap gap-3 items-center">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="py-2.5 px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 text-slate-700 w-full sm:w-auto">
          <option value="">All Status</option>
          <option>Pending</option><option>Approved</option><option>Rejected</option><option>Cancelled</option>
        </select>
        {statusFilter && <button onClick={() => setStatusFilter('')} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><X size={12} /> Clear</button>}
        <span className="sm:ml-auto text-sm text-slate-400 w-full sm:w-auto">{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Mobile Card View */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          Array.from({length:2}).map((_,i) => <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse h-24" />)
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100">
            <EmptyState icon={Clock} title="No permission requests" description="You haven't submitted any permission requests yet." />
          </div>
        ) : requests.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-100 p-4" onClick={() => setSelected(r)}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="font-semibold text-slate-800">{formatDate(r.permission_date)}</p>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-sm text-slate-600">{formatTime(r.start_time)} – {formatTime(r.end_time)}</p>
            <p className="text-xs text-slate-400 mt-1">{formatDuration(r.duration_minutes)} · Applied {formatDate(r.applied_at?.split('T')[0])}</p>
            {r.status === 'Pending' && (
              <button
                onClick={(e) => { e.stopPropagation(); setSelected(r) }}
                className="mt-3 w-full min-h-[44px] text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                Cancel Request
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">From</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">To</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Applied On</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">Loading…</td></tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState icon={Clock} title="No permission requests" description="You haven't submitted any permission requests yet." />
                  </td>
                </tr>
              ) : requests.map(r => (
                <tr key={r.id} className="table-row-hover" onClick={() => setSelected(r)}>
                  <td className="px-5 py-3.5 text-slate-800 font-medium">{formatDate(r.permission_date)}</td>
                  <td className="px-4 py-3.5 text-slate-600">{formatTime(r.start_time)}</td>
                  <td className="px-4 py-3.5 text-slate-600">{formatTime(r.end_time)}</td>
                  <td className="px-4 py-3.5 text-slate-600">{formatDuration(r.duration_minutes)}</td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs">{formatDate(r.applied_at?.split('T')[0])}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={r.status} /></td>
                  <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                    {r.status === 'Pending' && (
                      <button onClick={() => setSelected(r)} className="text-xs text-red-500 hover:underline">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Permission Details" size="sm">
        {selected && (
          <div className="space-y-4">
            <div className="text-sm space-y-1.5">
              <Row label="Date" value={formatDate(selected.permission_date)} />
              <Row label="From" value={formatTime(selected.start_time)} />
              <Row label="To" value={formatTime(selected.end_time)} />
              <Row label="Duration" value={formatDuration(selected.duration_minutes)} />
              <Row label="Reason" value={selected.reason} />
              <Row label="Applied On" value={formatDate(selected.applied_at?.split('T')[0])} />
              <div className="flex justify-between pt-1"><span className="text-slate-500">Status</span><StatusBadge status={selected.status} /></div>
              {selected.rejection_reason && (
                <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
                  <p className="font-medium mb-0.5">Rejection Reason</p>
                  <p>{selected.rejection_reason}</p>
                </div>
              )}
            </div>
            {selected.status === 'Pending' && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-3">Cancel this permission request?</p>
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>Keep</Button>
                  <Button variant="danger" size="sm" loading={cancelling} onClick={handleCancel}>Cancel Request</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b border-slate-50 pb-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-700 text-right max-w-[200px]">{value}</span>
    </div>
  )
}
