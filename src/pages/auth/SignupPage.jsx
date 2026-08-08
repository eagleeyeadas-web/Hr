import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Building2, User, Phone } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import toast from 'react-hot-toast'

export default function SignupPage() {
  const { signUpEmployee } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Please enter both your name and phone number.')
      return
    }

    setLoading(true)
    try {
      await signUpEmployee(form.name, form.phone)
      toast.success('Registration successful!')
      navigate('/employee/dashboard')
    } catch (err) {
      setError(err.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }} />

      <div className="relative w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-6 sm:px-8 sm:py-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-3">
              <Building2 size={24} className="text-white" />
            </div>
            <h1 className="text-lg font-bold text-white">Employee Sign Up</h1>
            <p className="text-xs text-slate-300 mt-1">Create your portal access instantly</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="relative">
              <User size={16} className="absolute left-3 top-9 text-slate-400" />
              <Input
                label="Full Name *"
                type="text"
                placeholder="e.g. Arun Kumar"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-400 pl-10"
              />
            </div>

            {/* Phone */}
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-9 text-slate-400" />
              <Input
                label="Phone Number *"
                type="tel"
                placeholder="e.g. 9876543210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-400 pl-10"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-2">
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <Button type="submit" loading={loading} className="w-full mt-2 min-h-[44px]">
              Create Account & Log In
            </Button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-400 hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
