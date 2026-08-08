import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Building2, Mail, Lock, Eye, EyeOff, Phone, Shield } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { signInHR, signInEmployee } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('employee') // Default to employee login
  const [form, setForm] = useState({ email: '', password: '', phone: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (activeTab === 'hr') {
      if (!form.email || !form.password) {
        setError('Please enter your email and password.')
        return
      }
      setLoading(true)
      try {
        const { data, error: authError } = await signInHR(form.email, form.password)
        if (authError) {
          setError(authError.message || 'Invalid credentials.')
          setLoading(false)
          return
        }
        
        // Wait a small tick for AuthContext state to sync profile
        const { supabase } = await import('../../lib/supabase')
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()

        if (prof?.role === 'admin' || prof?.role === 'hr') {
          toast.success('Admin/HR logged in successfully!')
          navigate('/hr/dashboard')
        } else {
          setError('Unauthorized. This portal is for HR/Admin users.')
          setLoading(false)
        }
      } catch (err) {
        setError('Login failed. Please check credentials.')
        setLoading(false)
      }
    } else {
      // Employee Phone Login
      if (!form.phone.trim()) {
        setError('Please enter your phone number.')
        return
      }
      setLoading(true)
      try {
        await signInEmployee(form.phone)
        toast.success('Logged in successfully!')
        navigate('/employee/dashboard')
      } catch (err) {
        setError(err.message || 'Phone number not registered.')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }} />

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-6 sm:px-8 sm:py-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-600/30">
              <Building2 size={28} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">HR Portal</h1>
            <p className="text-sm text-slate-300 mt-1">Sign in to your account</p>
          </div>

          {/* Role Tabs */}
          <div className="flex bg-white/5 p-1 rounded-lg mb-6 border border-white/10">
            <button
              type="button"
              onClick={() => { setActiveTab('employee'); setError('') }}
              className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition ${activeTab === 'employee' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Employee Login
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('hr'); setError('') }}
              className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition ${activeTab === 'hr' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              HR / Admin
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {activeTab === 'hr' ? (
              <>
                {/* Email */}
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 text-white placeholder:text-slate-400 rounded-lg py-3 pl-10 pr-4 text-base sm:text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    autoComplete="email"
                  />
                </div>

                {/* Password */}
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 text-white placeholder:text-slate-400 rounded-lg py-3 pl-10 pr-10 text-base sm:text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </>
            ) : (
              /* Phone Input for Employees */
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  placeholder="Registered phone number"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-white/10 border border-white/20 text-white placeholder:text-slate-400 rounded-lg py-3 pl-10 pr-4 text-base sm:text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-2">
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 min-h-[44px] rounded-lg text-sm transition-all shadow-lg shadow-blue-600/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </form>

          {activeTab === 'employee' && (
            <p className="text-center text-xs text-slate-400 mt-6">
              New employee?{' '}
              <Link to="/signup" className="text-blue-400 hover:underline font-medium">
                Sign Up
              </Link>
            </p>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          © {new Date().getFullYear()} HR Portal. All rights reserved.
        </p>
      </div>
    </div>
  )
}
