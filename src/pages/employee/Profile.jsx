import { useAuth } from '../../context/AuthContext'
import { Phone, User } from 'lucide-react'
import { getInitials } from '../../lib/utils'

export default function EmployeeProfilePage() {
  const { employee } = useAuth()

  if (!employee) return (
    <div className="flex items-center justify-center min-h-[60vh] text-slate-500 text-sm">
      Profile not found. Please contact HR.
    </div>
  )

  return (
    <div className="max-w-xl space-y-5">
      {/* Profile Card */}
      <div className="bg-white rounded-xl border border-slate-100 p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-700 shrink-0">
            {getInitials(employee.full_name)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{employee.full_name}</h1>
            <p className="text-xs text-slate-400 mt-1">Employee Account</p>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="bg-white rounded-xl border border-slate-100 divide-y divide-slate-50">
        <Detail icon={User} label="Full Name" value={employee.full_name} />
        <Detail icon={Phone} label="Phone Number" value={employee.phone} />
      </div>
    </div>
  )
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <Icon size={16} className="text-slate-400 shrink-0" />
      <div className="flex-1 flex items-center justify-between gap-4">
        <span className="text-sm text-slate-500">{label}</span>
        <span className="text-sm font-medium text-slate-800 text-right">{value || '—'}</span>
      </div>
    </div>
  )
}
