import { useState } from 'react'
import { Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/ui/Button'
import { Textarea, Input } from '../../components/ui/Input'
import { calculateDurationMinutes, formatDate, formatTime, formatDuration } from '../../lib/utils'
import toast from 'react-hot-toast'

const EMPTY_FORM = { permission_date: '', start_time: '', end_time: '', reason: '' }

export default function PermissionRequest() {
  const { employee } = useAuth()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedData, setSubmittedData] = useState(null)

  const duration = calculateDurationMinutes(form.start_time, form.end_time)
  const validDuration = form.start_time && form.end_time && form.start_time < form.end_time

  const validate = () => {
    const errs = {}
    if (!form.permission_date) errs.permission_date = 'Select a date'
    if (!form.start_time) errs.start_time = 'Select start time'
    if (!form.end_time) errs.end_time = 'Select end time'
    if (form.start_time && form.end_time && form.start_time >= form.end_time) errs.end_time = 'End time must be after start time'
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
      const { data: insertedReq, error } = await supabase
        .from('permission_requests')
        .insert({
          employee_phone: employee.phone,
          permission_date: form.permission_date,
          start_time: form.start_time,
          end_time: form.end_time,
          duration_minutes: duration,
          reason: form.reason,
          status: 'Pending',
          applied_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      // Insert self notification
      await supabase.from('notifications').insert({
        employee_phone: employee.phone,
        title: 'Permission Request Submitted',
        message: `Your permission request for ${formatDate(form.permission_date)} has been submitted and is pending HR approval.`,
        type: 'permission',
        related_id: insertedReq.id
      })

      // Query all HR admin profiles
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
        console.warn('[HR TARGET DEBUG] ⚠️ No HR/Admin users found in profiles table.');
      }

      // Insert HR notification for all admins
      if (hrUsers && hrUsers.length > 0) {
        const hrNotifications = hrUsers.map(hr => ({
          user_id: hr.id,
          title: 'New Permission Request',
          message: `${employee.full_name} submitted a permission request.`,
          type: 'permission',
          related_id: insertedReq.id
        }))

        // =============================================
        // [LIVE PUSH DEBUG]
        // =============================================
        console.log('[LIVE PUSH DEBUG]');
        console.log('send-push called: true (via DB webhook on notification insert)');
        console.log('target user ids:', hrUsers.map(h => h.id));
        console.log('notification type: permission');
        console.log('related_id:', insertedReq.id);

        await supabase.from('notifications').insert(hrNotifications)
        console.log('[LIVE PUSH DEBUG] HR notification rows inserted:', hrNotifications.length);
      }

      // Insert audit log
      await supabase.from('audit_logs').insert({
        action: 'CREATED',
        entity_type: 'permission_request',
        entity_id: insertedReq.id,
        employee_phone: employee.phone,
        details: { date: form.permission_date, start_time: form.start_time, end_time: form.end_time },
      })

      toast.success('Permission request submitted!')
      setSubmittedData({ ...form, duration })
      setSubmitted(true)
      setForm(EMPTY_FORM)
    } catch (err) {
      toast.error(err.message || 'Failed to submit')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md">
      {submitted && submittedData && (
        <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-emerald-800 mb-2">✅ Permission Request Submitted!</p>
          <div className="text-sm text-emerald-700 space-y-1">
            <div className="flex justify-between"><span>Date:</span><span className="font-medium">{formatDate(submittedData.permission_date)}</span></div>
            <div className="flex justify-between"><span>From:</span><span className="font-medium">{formatTime(submittedData.start_time)}</span></div>
            <div className="flex justify-between"><span>To:</span><span className="font-medium">{formatTime(submittedData.end_time)}</span></div>
            <div className="flex justify-between"><span>Duration:</span><span className="font-medium">{formatDuration(submittedData.duration)}</span></div>
            <div className="flex justify-between"><span>Status:</span><span className="font-medium">Pending HR Approval</span></div>
          </div>
          <button onClick={() => setSubmitted(false)} className="mt-3 text-xs text-emerald-600 hover:underline">Submit another →</button>
        </div>
      )}

      {!submitted && (
        <div className="bg-white rounded-xl border border-slate-100">
          <div className="px-6 py-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <Clock size={18} className="text-purple-600" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 text-sm">Request Permission</h2>
                <p className="text-[11px] text-slate-400">Apply for short duration permission</p>
              </div>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <Input
              label="Permission Date *"
              type="date"
              value={form.permission_date}
              onChange={e => setForm({ ...form, permission_date: e.target.value })}
              error={errors.permission_date}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Start Time *"
                type="time"
                value={form.start_time}
                onChange={e => setForm({ ...form, start_time: e.target.value })}
                error={errors.start_time}
              />
              <Input
                label="End Time *"
                type="time"
                value={form.end_time}
                onChange={e => setForm({ ...form, end_time: e.target.value })}
                error={errors.end_time}
              />
            </div>

            {validDuration && (
              <div className="bg-slate-50 rounded-lg p-3 flex justify-between items-center text-xs">
                <span className="text-slate-500">Calculated Duration:</span>
                <span className="font-semibold text-slate-800">{formatDuration(duration)}</span>
              </div>
            )}

            <Textarea
              label="Reason *"
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="State the reason for permission request…"
              rows={4}
              error={errors.reason}
            />

            <Button type="submit" loading={loading} className="w-full">
              Submit Request
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
