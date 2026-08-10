import { useState, useEffect } from 'react'
import { CalendarOff, Info, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/ui/Button'
import { Select, Textarea, Input } from '../../components/ui/Input'
import { LEAVE_TYPES, calculateCalendarDays, formatDate } from '../../lib/utils'
import toast from 'react-hot-toast'

const EMPTY_FORM = {
  leave_type: '',
  start_date: '',
  end_date: '',
  reason: '',
  attachment: null,
}

export default function ApplyLeave() {
  const { employee } = useAuth()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [balance, setBalance] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [submittedData, setSubmittedData] = useState(null)

  useEffect(() => {
    if (!employee) return
    const fetchBalance = async () => {
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('leave_type, status, total_days')
        .eq('employee_phone', employee.phone)

      const { data: compoffs } = await supabase
        .from('compoff_requests')
        .select('status, credited_days')
        .eq('employee_phone', employee.phone)

      // Earned leave credits ledger (carries forward across months)
      const { data: earnedCredits } = await supabase
        .from('earned_leave_credits')
        .select('earned_credits')
        .eq('employee_phone', employee.phone)

      // ---- COMP-OFF BALANCE ----
      const compOffEarned = (compoffs || [])
        .filter(r => r.status === 'Approved')
        .reduce((sum, r) => sum + (r.credited_days || 1), 0)
      const compOffUsed = (leaves || [])
        .filter(r => r.status === 'Approved' && r.leave_type === 'Comp-Off')
        .reduce((sum, r) => sum + (r.total_days || 0), 0)
      const compoffRemaining = Math.max(0, compOffEarned - compOffUsed)

      // Fetch latest employee allocation details
      const { data: latestEmp } = await supabase
        .from('employees')
        .select('leave_allocation')
        .eq('phone', employee.phone)
        .single()
      
      const baseAllocation = latestEmp?.leave_allocation ?? 0

      // ---- EARNED LEAVE BALANCE ----
      const totalEarnedCredits = (earnedCredits || []).reduce((sum, row) => sum + (row.earned_credits || 0), 0)
      const earnedLeaveUsed = (leaves || [])
        .filter(r => r.status === 'Approved' && r.leave_type === 'Earned Leave')
        .reduce((sum, r) => sum + (r.total_days || 0), 0)
      const earnedLeaveRemaining = Math.max(0, baseAllocation + totalEarnedCredits - earnedLeaveUsed)

      setBalance({
        compoff_remaining: compoffRemaining,
        earned_leave_remaining: earnedLeaveRemaining,
      })
    }
    fetchBalance()
  }, [employee, submitted])

  const totalDays = calculateCalendarDays(form.start_date, form.end_date)
  // Only validate balance for Comp-Off and Earned Leave (these are the only credit-based types)
  const overBalance = balance && (
    form.leave_type === 'Comp-Off'
      ? totalDays > (balance.compoff_remaining || 0)
      : form.leave_type === 'Earned Leave'
        ? totalDays > (balance.earned_leave_remaining || 0)
        : false  // Other types (Casual, Sick, Emergency, LOP, Other) have no cap
  )

  const validate = () => {
    const errs = {}
    if (!form.leave_type) errs.leave_type = 'Select a leave type'
    if (!form.start_date) errs.start_date = 'Select start date'
    if (!form.end_date) errs.end_date = 'Select end date'
    if (form.start_date && form.end_date && form.start_date > form.end_date) errs.end_date = 'End date must be after start date'
    if (!form.reason.trim()) errs.reason = 'Please provide a reason'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    try {
      let attachment_url = null

      // Upload attachment if provided
      if (form.attachment) {
        const fileExt = form.attachment.name.split('.').pop()
        const fileName = `${employee.phone}/${Date.now()}.${fileExt}`
        const { error: uploadErr } = await supabase.storage
          .from('leave-attachments')
          .upload(fileName, form.attachment)
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('leave-attachments').getPublicUrl(fileName)
          attachment_url = urlData?.publicUrl || null
        }
      }

      const { data: insertedReq, error } = await supabase
        .from('leave_requests')
        .insert({
          employee_phone: employee.phone,
          leave_type: form.leave_type,
          start_date: form.start_date,
          end_date: form.end_date,
          total_days: totalDays,
          reason: form.reason,
          attachment_url,
          status: 'Pending',
          applied_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      // Insert notification for self
      await supabase.from('notifications').insert({
        employee_phone: employee.phone,
        title: 'Leave Request Submitted',
        message: `Your ${form.leave_type} request has been submitted and is pending HR approval.`,
        type: 'leave',
        related_id: insertedReq.id
      })

      // Insert notifications for all HR/Admin roles
      const { data: hrUsers, error: hrLookupErr } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'hr'])

      // =============================================
      // [HR TARGET DEBUG]
      // =============================================
      console.log('[HR TARGET DEBUG]');
      console.log('HR lookup error:', hrLookupErr || 'none');
      console.log('HR users found:', hrUsers?.length ?? 0);
      if (hrUsers && hrUsers.length > 0) {
        console.log('resolved HR user ids:', hrUsers.map(h => h.id));
      } else {
        console.warn('[HR TARGET DEBUG] ⚠️ No HR/Admin users found in profiles table. Notifications will NOT be delivered to HR.');
      }

      if (hrUsers && hrUsers.length > 0) {
        const hrNotifications = hrUsers.map(hr => ({
          user_id: hr.id,
          title: 'New Leave Request',
          message: `${employee.full_name} submitted a ${form.leave_type} request.`,
          type: 'leave',
          related_id: insertedReq.id
        }))

        // =============================================
        // [LIVE PUSH DEBUG]
        // =============================================
        console.log('[LIVE PUSH DEBUG]');
        console.log('send-push called: true (via DB webhook on notification insert)');
        console.log('target user ids:', hrUsers.map(h => h.id));
        console.log('notification type: leave');
        console.log('related_id:', insertedReq.id);

        await supabase.from('notifications').insert(hrNotifications)
        console.log('[LIVE PUSH DEBUG] HR notification rows inserted:', hrNotifications.length);
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        action: 'CREATED',
        entity_type: 'leave_request',
        entity_id: insertedReq.id,
        employee_phone: employee.phone,
        details: { leave_type: form.leave_type, start_date: form.start_date, end_date: form.end_date },
      })

      toast.success('Leave request submitted successfully!')
      setSubmittedData({ ...form, totalDays })
      setSubmitted(true)
      setForm(EMPTY_FORM)
    } catch (err) {
      toast.error(err.message || 'Failed to submit leave request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      {submitted && submittedData && (
        <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-emerald-800 mb-2">✅ Leave Request Submitted!</p>
          <div className="text-sm text-emerald-700 space-y-1">
            <div className="flex justify-between"><span>Leave Type:</span><span className="font-medium">{submittedData.leave_type}</span></div>
            <div className="flex justify-between"><span>Start Date:</span><span className="font-medium">{formatDate(submittedData.start_date)}</span></div>
            <div className="flex justify-between"><span>End Date:</span><span className="font-medium">{formatDate(submittedData.end_date)}</span></div>
            <div className="flex justify-between"><span>Total Days:</span><span className="font-medium">{submittedData.totalDays} day{submittedData.totalDays !== 1 ? 's' : ''}</span></div>
            <div className="flex justify-between"><span>Status:</span><span className="font-medium">Pending HR Approval</span></div>
          </div>
          <button onClick={() => setSubmitted(false)} className="mt-3 text-xs text-emerald-600 hover:underline">Apply for another leave →</button>
        </div>
      )}

      {!submitted && (
        <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><CalendarOff size={20} /></div>
            <div>
              <h2 className="font-bold text-slate-800">Apply for Leave</h2>
              <p className="text-xs text-slate-400">Specify dates and select leave type</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              label="Leave Type *"
              value={form.leave_type}
              onChange={e => setForm({ ...form, leave_type: e.target.value })}
              error={errors.leave_type}
            >
              <option value="">Select leave type</option>
              {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
            </Select>

            {/* Balance indicator — only for credit-based leave types */}
            {form.leave_type && balance && (form.leave_type === 'Comp-Off' || form.leave_type === 'Earned Leave') && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs flex justify-between items-center">
                <span className="text-slate-500">Available {form.leave_type} balance:</span>
                <span className="font-bold text-blue-700">
                  {form.leave_type === 'Comp-Off'
                    ? balance.compoff_remaining
                    : balance.earned_leave_remaining} days
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Start Date *"
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                error={errors.start_date}
              />
              <Input
                label="End Date *"
                type="date"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                error={errors.end_date}
              />
            </div>

            {form.start_date && form.end_date && !errors.end_date && (
              <div className="bg-slate-50 rounded-lg p-3 flex justify-between items-center text-sm">
                <span className="text-slate-500">Duration:</span>
                <span className="font-semibold text-slate-800">{totalDays} day{totalDays !== 1 ? 's' : ''}</span>
              </div>
            )}

            {overBalance && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5">
                <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 leading-normal">
                  You are applying for <strong>{totalDays} day{totalDays !== 1 ? 's' : ''}</strong>, but your{' '}
                  {form.leave_type === 'Comp-Off' ? 'Comp-Off' : 'Earned Leave'} balance is only{' '}
                  <strong>
                    {form.leave_type === 'Comp-Off'
                      ? (balance?.compoff_remaining ?? 0)
                      : (balance?.earned_leave_remaining ?? 0)} days
                  </strong>.{' '}
                  {form.leave_type === 'Comp-Off'
                    ? 'You need more approved Comp-Off credits.':
                    'You need more worked-day earned-leave credits.'}
                </p>
              </div>
            )}

            <Textarea
              label="Reason for Leave *"
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="Provide a detailed reason for leave…"
              rows={4}
              error={errors.reason}
            />

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Supporting Document</label>
              <div className="border border-dashed border-slate-200 rounded-lg p-6 min-h-[120px] flex flex-col items-center justify-center hover:bg-slate-50/50 transition-colors">
                <Upload size={24} className="text-slate-400 mb-2" />
                <label className="text-sm font-semibold text-blue-600 hover:underline cursor-pointer min-h-[44px] flex items-center">
                  Choose File
                  <input
                    type="file"
                    className="hidden"
                    onChange={e => setForm({ ...form, attachment: e.target.files[0] })}
                  />
                </label>
                <span className="text-[10px] text-slate-400 mt-0.5">PDF, JPG, PNG (Max 5MB)</span>
                {form.attachment && (
                  <p className="text-xs font-semibold text-slate-600 mt-2">Selected: {form.attachment.name}</p>
                )}
              </div>
            </div>

            <Button type="submit" loading={loading} className="w-full">
              Submit Leave Request
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
