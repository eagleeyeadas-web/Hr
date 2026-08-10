import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfileAndEmployee = async (userId) => {
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!profErr && prof) {
      setProfile(prof)
      setEmployee(null)
    }
  }

  const fetchEmployeeRecord = async (phone) => {
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('*')
      .eq('phone', phone)
      .single()

    if (!empErr && emp) {
      setEmployee(emp)
      setProfile({ role: 'employee' })
    } else {
      localStorage.removeItem('employee_phone')
    }
  }

  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true)
      
      // 1. Check local storage for phone session first
      const localEmpPhone = localStorage.getItem('employee_phone')
      if (localEmpPhone) {
        await fetchEmployeeRecord(localEmpPhone)
        setLoading(false)
        return
      }

      // 2. Fallback to Supabase Auth (for HR/Admin)
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfileAndEmployee(session.user.id)
      }
      setLoading(false)
    }

    initializeAuth()

    // Listen for auth changes (for HR)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // If we have a local employee session, don't let auth state override it
      if (localStorage.getItem('employee_phone')) {
        setLoading(false)
        return
      }

      setLoading(true)
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfileAndEmployee(session.user.id)
      } else {
        setProfile(null)
        setEmployee(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInHR = async (email, password) => {
    // Clear any existing employee state
    localStorage.removeItem('employee_phone')
    setEmployee(null)
    setProfile(null)
    setUser(null)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  const signInEmployee = async (phone) => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('phone', phone.trim())
      .single()

    if (error || !data) {
      throw new Error('Employee with this phone number not found.')
    }

    // Set employee state and localStorage first so that onAuthStateChange doesn't override it
    setEmployee(data)
    setProfile({ role: 'employee' })
    localStorage.setItem('employee_phone', data.phone)
    setUser(null)

    // Sign out of Supabase auth (in case an HR was logged in)
    await supabase.auth.signOut()

    return data
  }

  const signUpEmployee = async (name, phone, company, employeeType) => {
    // Check if phone already registered
    const { data: existing } = await supabase
      .from('employees')
      .select('phone')
      .eq('phone', phone.trim())
      .single()

    if (existing) {
      throw new Error('Phone number is already registered.')
    }

    const { data, error } = await supabase
      .from('employees')
      .insert({
        full_name: name,
        phone: phone.trim(),
        company: company,
        employee_type: employeeType
      })
      .select()
      .single()

    if (error) throw error

    setEmployee(data)
    setProfile({ role: 'employee' })
    localStorage.setItem('employee_phone', data.phone)
    return data
  }

  const signOut = async () => {
    localStorage.removeItem('employee_phone')
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setEmployee(null)
  }

  const isHR = profile?.role === 'admin' || profile?.role === 'hr'
  const isEmployee = profile?.role === 'employee' || !!employee

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      employee,
      loading,
      signInHR,
      signInEmployee,
      signUpEmployee,
      signOut,
      isHR,
      isEmployee
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
