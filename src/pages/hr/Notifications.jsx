import { useState, useEffect } from 'react'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatDate } from '../../lib/utils'
import { PageLoader } from '../../components/ui/Spinner'

export default function NotificationsPage() {
  const { user, employee } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = async () => {
    setLoading(true)
    let q = supabase.from('notifications').select('*')
    if (employee) {
      q = q.eq('employee_phone', employee.phone)
    } else if (user) {
      q = q.eq('user_id', user.id)
    } else {
      setNotifications([])
      setLoading(false)
      return
    }
    const { data } = await q.order('created_at', { ascending: false }).limit(50)
    setNotifications(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchNotifications() }, [user, employee])

  const markRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllRead = async () => {
    if (employee) {
      await supabase.from('notifications').update({ is_read: true }).eq('employee_phone', employee.phone)
    } else if (user) {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id)
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const unread = notifications.filter(n => !n.is_read).length

  if (loading) return <PageLoader />

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{unread} unread notification{unread !== 1 ? 's' : ''}</span>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
            <CheckCheck size={14} /> Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 py-16 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            <Bell size={22} className="text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">No notifications yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 divide-y divide-slate-50 overflow-hidden">
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => !n.is_read && markRead(n.id)}
              className={`flex items-start gap-3 px-5 py-4 transition-colors cursor-pointer ${!n.is_read ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'}`}
            >
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.is_read ? 'bg-blue-500' : 'bg-transparent'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${!n.is_read ? 'text-slate-900' : 'text-slate-700'}`}>{n.title}</p>
                <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
                <p className="text-xs text-slate-400 mt-1">{formatDate(n.created_at?.split('T')[0])}</p>
              </div>
              {!n.is_read && (
                <button
                  onClick={e => { e.stopPropagation(); markRead(n.id) }}
                  className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Mark as read"
                >
                  <Check size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
