import { useState, useEffect } from 'react'
import { Calendar, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
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

  const employeeType = employee?.employee_type || null
  const isSenior = employeeType === 'Senior'
  const isJunior = employeeType === 'Junior'

  const fetchData = async () => {
    if (!employee) return
    setDataLoading(true)
    try {
      const { data: compoffs, error: compoffsErr } = await supabase
        .from('compoff_requests')
        .select('*')
        .eq('employee_phone', employee.phone)
        .order('created_at', { ascending: false })

      if (compoffsErr) throw compoffsErr
      setRequests(compoffs || [])

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

      setBalance({ earned, used, remaining: Math.max(0, earned - used) })
    } catch (err) {
      toast.error('Failed to load Comp-Off details')
      console.error(err)
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [employee, submitted])

  const validate = () => {
    const errs = {}
    if (!form.worked_date) {
      errs.worked_date = 'Please select the date you worked.'
      return errs
    }
    const [year, month, day] = form.worked_date.split('-').map(Number)
    const dateObj = new Date(year, month - 1, day)
    const dow = dateObj.getDay()
    const isSaturday = dow === 6
    const isSunday = dow === 0

    if (!isSaturday && !isSunday) {
      errs.worked_date = 'Comp-Off can only be claimed for a Saturday or Sunday.'
      return errs
    }
    if (isJunior && isSaturday) {
      errs.worked_date = 'Junior employees cannot claim Comp-Off for Saturday work. Only Sunday work is eligible.'
      return errs
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
      const { data: insertedReq, error } = await supabase
        .from('compoff_requests')
        .insert({ employee_phone: employee.phone, worked_date: form.worked_date, status: 'Pending', credited_days: 1 })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') throw new Error('You have already submitted a Comp-Off request for this date.')
        throw error
      }

      const { data: hrUsers } = await supabase.from('profiles').select('id').in('role', ['admin', 'hr'])

      await supabase.from('notifications').insert({
        employee_phone: employee.phone,
        title: 'Comp-Off Request Submitted',
        message: `Your Comp-Off request for worked date ${formatDate(form.worked_date)} has been submitted and is pending HR approval.`,
        type: 'compoff',
        related_id: insertedReq.id
      })

      if (hrUsers && hrUsers.length > 0) {
        await supabase.from('notifications').insert(
          hrUsers.map(hr => ({
            user_id: hr.id,
            title: 'New Comp-Off Request',
            message: `${employee.full_name} submitted a Comp-Off request for ${formatDate(form.worked_date)}.`,
            type: 'compoff',
            related_id: insertedReq.id
          }))
        )
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

  const eligibilityInfo = isSenior
    ? 'As a Senior employee, you can claim Comp-Off for working on Saturday or Sunday.'
    : isJunior
      ? 'As a Junior employee, you can only claim Comp-Off for working on Sunday. Saturday Comp-Off is not applicable.'
      : 'Select the holiday date you worked to submit a Comp-Off request.'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">Comp-Off Balance</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Earned Credits" value={`${balance.earned} days`} icon={CheckCircle} color="blue" />
          <StatCard label="Used Credits" value={`${balance.used} days`} icon={Clock} color="green" />
          <StatCard label="Available Balance" value={`${balance.remaining} days`} icon={Calendar} color="amber" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-xl border border-slate-100 p-5 space-y-4 h-fit">
          <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
            <Calendar size={18} className="text-blue-500" /> Apply Comp-Off
          </h2>

          <div className={`rounded-lg p-3 text-xs leading-relaxed flex gap-2 items-start ${
            isJunior ? 'bg-amber-50 border border-amber-200 text-amber-800'
              : isSenior ? 'bg-blue-50 border border-blue-200 text-blue-800'
              : 'bg-slate-50 border border-slate-200 text-slate-600'
          }`}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{eligibilityInfo}</span>
          </div>

          {employeeType && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Employee Type:</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                isSenior ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
              }`}>{employeeType}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Worked Holiday Date *"
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

        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 p-5 space-y-4">
          <h2 className="font-semibold text-lg text-slate-800">Request History</h2>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="text-left py-3 text-xs font-semibold uppercase text-slate-500">Worked Date</th>
                  <th className="text-left py-3 text-xs font-semibold uppercase text-slate-500">Day</th>
                  <th className="text-left py-3 text-xs font-semibold uppercase text-slate-500">Credited Days</th>
                  <th className="text-left py-3 text-xs font-semibold uppercase text-slate-500">Applied On</th>
                  <th className="text-right py-3 text-xs font-semibold uppercase text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-sm text-slate-400">No Comp-Off request history found.</td>
                  </tr>
                ) : requests.map(r => {
                  const d = r.worked_date ? new Date(r.worked_date + 'T00:00:00') : null
                  const dayLabel = d ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] : '—'
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 font-medium text-slate-800">{formatDate(r.worked_date)}</td>
                      <td className="py-3 text-slate-500 text-xs">{dayLabel}</td>
                      <td className="py-3">{r.credited_days}</td>
                      <td className="py-3 text-slate-500 text-xs">{formatDate(r.created_at?.split('T')[0])}</td>
                      <td className="py-3 text-right"><StatusBadge status={r.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="block md:hidden space-y-3">
            {requests.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-400">No Comp-Off request history found.</div>
            ) : requests.map(r => {
              const d = r.worked_date ? new Date(r.worked_date + 'T00:00:00') : null
              const dayLabel = d ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] : '—'
              return (
                <div key={r.id} className="border border-slate-100 rounded-xl p-4 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800">{formatDate(r.worked_date)} <span className="text-slate-400 text-xs font-normal">({dayLabel})</span></p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-slate-500">Credited Days: {r.credited_days} · Applied: {formatDate(r.created_at?.split('T')[0])}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
