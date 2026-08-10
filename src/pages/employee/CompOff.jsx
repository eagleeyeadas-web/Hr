import { useState, useEffect } from 'react'
import { Calendar, CheckCircle, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { formatDate } from '../../lib/utils'
import { StatusBadge } from '../../components/ui/Badge'
import { StatCard, PageLoader } from '../../components/ui/Spinner'
import toast from 'react-hot-toast'

const EMPTY_FORM = {
  worked_date: '',
}

export default function EmployeeCompOff() {
  const { employee } = useAuth()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [balance, setBalance] = useState({ earned: 0, used: 0, remaining: 0 })
  const [requests, setRequests] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)

  const fetchData = async () => {
    if (!employee) return
    setDataLoading(true)
    try {
      // 1. Fetch comp-off requests
      const { data: compoffs, error: compoffsErr } = await supabase
        .from('compoff_requests')
        .select('*')
        .eq('employee_phone', employee.phone)
        .order('created_at', { ascending: false })

      if (compoffsErr) throw compoffsErr
      setRequests(compoffs || [])

      // 2. Fetch leave requests of type 'Comp-Off'
      const { data: leaves, error: leavesErr } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_phone', employee.phone)
        .eq('leave_type', 'Comp-Off')
        .eq('status', 'Approved')

      if (leavesErr) throw leavesErr

      const earned = (compoffs || [])
        .filter(r => r.status === 'Approved')
        .reduce((sum, r) => sum + (r.credited_days || 1), 0)

      const used = (leaves || [])
        .reduce((sum, r) => sum + (r.total_days || 0), 0)

      setBalance({
        earned,
        used,
        remaining: Math.max(0, earned - used)
      })
    } catch (err) {
      toast.error('Failed to load Comp-Off details')
      console.error(err)
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [employee, submitted])

  const validate = () => {
    const errs = {}
    if (!form.worked_date) {
      errs.worked_date = 'Select the worked Saturday date'
    } else {
      const [year, month, day] = form.worked_date.split('-').map(Number)
      const dateObj = new Date(year, month - 1, day)
      if (dateObj.getDay() !== 6) {
        errs.worked_date = 'Worked Date must be a Saturday.'
      }
    }
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    try {
      // Insert request
      const { data: insertedReq, error } = await supabase
        .from('compoff_requests')
        .insert({
          employee_phone: employee.phone,
          worked_date: form.worked_date,
          status: 'Pending',
          credited_days: 1
        })
        .select()
        .single()

      if (error) throw error

      // Insert notifications for all HR/Admin roles
      const { data: hrUsers } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'hr'])

      // Insert employee self notification (Comp-Off Request Submitted)
      await supabase.from('notifications').insert({
        employee_phone: employee.phone,
        title: 'Comp-Off Request Submitted',
        message: `Your Comp-Off request for worked Saturday ${formatDate(form.worked_date)} has been submitted and is pending HR approval.`,
        type: 'compoff',
        related_id: insertedReq.id
      })

      // Insert HR push notifications
      if (hrUsers && hrUsers.length > 0) {
        const hrNotifications = hrUsers.map(hr => ({
          user_id: hr.id,
          title: 'New Comp-Off Request',
          message: `${employee.full_name} submitted a Comp-Off request.`,
          type: 'compoff',
          related_id: insertedReq.id
        }))
        await supabase.from('notifications').insert(hrNotifications)
      }

      toast.success('Comp-Off request submitted successfully!')
      setForm(EMPTY_FORM)
      setSubmitted(!submitted)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (dataLoading || !employee) return <PageLoader />

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">Comp-Off Balance</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Earned Credits" value={`${balance.earned} days`} icon={CheckCircle} color="blue" />
          <StatCard label="Used Credits" value={`${balance.used} days`} icon={Clock} color="green" />
          <StatCard label="Available Balance" value={`${balance.remaining} days`} icon={Calendar} color="amber" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-100 p-5 space-y-4 h-fit">
          <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
            <Calendar size={18} className="text-blue-500" /> Apply Comp-Off
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Worked Saturday Date *"
              type="date"
              value={form.worked_date}
              onChange={e => setForm({ ...form, worked_date: e.target.value })}
              error={errors.worked_date}
            />
            <Button type="submit" loading={loading} className="w-full">
              Submit Request
            </Button>
          </form>
        </div>

        {/* History List */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 p-5 space-y-4">
          <h2 className="font-semibold text-lg text-slate-800">Request History</h2>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="text-left py-3 text-xs font-semibold uppercase text-slate-500">Worked Date</th>
                  <th className="text-left py-3 text-xs font-semibold uppercase text-slate-500">Credited Days</th>
                  <th className="text-left py-3 text-xs font-semibold uppercase text-slate-500 font-sans">Applied On</th>
                  <th className="text-right py-3 text-xs font-semibold uppercase text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-sm text-slate-400">
                      No Comp-Off request history found.
                    </td>
                  </tr>
                ) : (
                  requests.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 font-medium text-slate-800">{formatDate(r.worked_date)}</td>
                      <td className="py-3">{r.credited_days}</td>
                      <td className="py-3 text-slate-500 text-xs">{formatDate(r.created_at?.split('T')[0])}</td>
                      <td className="py-3 text-right">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden space-y-3">
            {requests.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-400">
                No Comp-Off request history found.
              </div>
            ) : (
              requests.map(r => (
                <div key={r.id} className="border border-slate-100 rounded-xl p-4 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800">{formatDate(r.worked_date)}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-slate-500">Credited Days: {r.credited_days} · Applied: {formatDate(r.created_at?.split('T')[0])}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
