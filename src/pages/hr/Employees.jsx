import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Edit2, Eye, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getInitials } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { PageLoader, EmptyState, SkeletonRow } from '../../components/ui/Spinner'
import toast from 'react-hot-toast'

const EMPTY_FORM = {
  full_name: '',
  phone: '',
  leave_allocation: 1,
}

export default function Employees() {
  const navigate = useNavigate()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editEmployee, setEditEmployee] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('employees').select('*').order('full_name')
    if (!error) setEmployees(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  const filtered = employees.filter(e =>
    !search ||
    e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.phone?.toLowerCase().includes(search.toLowerCase())
  )

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setShowAddModal(true) }
  const openEdit = (emp) => {
    const localAlloc = localStorage.getItem('leave_alloc_' + emp.phone)
    setForm({
      ...emp,
      leave_allocation: emp.leave_allocation ?? (localAlloc ? parseFloat(localAlloc) : 1)
    })
    setFormError('')
    setEditEmployee(emp)
  }
  const closeModal = () => { setShowAddModal(false); setEditEmployee(null); setForm(EMPTY_FORM) }

  const handleSave = async () => {
    setFormError('')
    if (!form.full_name || !form.phone) {
      setFormError('Please fill in all required fields.')
      return
    }
    const alloc = parseFloat(form.leave_allocation) || 1
    const phoneClean = form.phone.trim()
    localStorage.setItem('leave_alloc_' + phoneClean, alloc)

    setSaving(true)
    try {
      if (editEmployee) {
        // Try updating with leave_allocation field first
        let { error } = await supabase
          .from('employees')
          .update({
            full_name: form.full_name,
            phone: phoneClean,
            leave_allocation: alloc
          })
          .eq('phone', editEmployee.phone)

        if (error && error.code === 'PGRST204') {
          // Fallback if column not created in Supabase schema yet
          const fallback = await supabase
            .from('employees')
            .update({
              full_name: form.full_name,
              phone: phoneClean
            })
            .eq('phone', editEmployee.phone)
          error = fallback.error
        }

        if (error) throw error
        toast.success('Employee updated successfully')
      } else {
        // Check if phone already registered
        const { data: existing } = await supabase
          .from('employees')
          .select('phone')
          .eq('phone', phoneClean)
          .single()

        if (existing) {
          throw new Error('Phone number is already registered.')
        }

        let { error } = await supabase
          .from('employees')
          .insert({
            full_name: form.full_name,
            phone: phoneClean,
            leave_allocation: alloc
          })

        if (error && error.code === 'PGRST204') {
          // Fallback if column not created in Supabase schema yet
          const fallback = await supabase
            .from('employees')
            .insert({
              full_name: form.full_name,
              phone: phoneClean
            })
          error = fallback.error
        }

        if (error) throw error
        toast.success('Employee added successfully')
      }
      closeModal()
      fetchEmployees()
    } catch (err) {
      setFormError(err.message || 'An error occurred.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center">
          {/* Search */}
          <div className="relative flex-1 w-full min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employees by name or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 min-h-[44px] text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>
          <Button onClick={openAdd} size="md" className="w-full sm:w-auto">
            <Plus size={16} />
            Add Employee
          </Button>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="block md:hidden space-y-3">
        <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
          <p className="text-sm text-slate-500">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-1/2 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-1/3" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100">
            <EmptyState icon={Search} title="No employees found" description="Try adjusting your search criteria." />
          </div>
        ) : (
          filtered.map(emp => {
            const alloc = emp.leave_allocation ?? (localStorage.getItem('leave_alloc_' + emp.phone) ? parseFloat(localStorage.getItem('leave_alloc_' + emp.phone)) : 1)
            return (
              <div
                key={emp.phone}
                className="bg-white rounded-xl border border-slate-100 p-4 active:bg-slate-50"
                onClick={() => navigate(`/hr/employees/${emp.phone}`)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700 shrink-0">
                    {getInitials(emp.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{emp.full_name}</p>
                    <p className="text-sm text-slate-500 font-mono mt-0.5">{emp.phone}</p>
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-xs font-semibold mt-2">
                      {alloc} {alloc === 1 ? 'day' : 'days'} / mo
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => navigate(`/hr/employees/${emp.phone}`)}
                    className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Eye size={15} /> View
                  </button>
                  <button
                    onClick={() => openEdit(emp)}
                    className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <Edit2 size={15} /> Edit
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <p className="text-sm text-slate-500">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly Allocation</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState icon={Search} title="No employees found" description="Try adjusting your search criteria." />
                  </td>
                </tr>
              ) : (
                filtered.map(emp => {
                  const alloc = emp.leave_allocation ?? (localStorage.getItem('leave_alloc_' + emp.phone) ? parseFloat(localStorage.getItem('leave_alloc_' + emp.phone)) : 1)
                  return (
                    <tr
                      key={emp.phone}
                      className="table-row-hover"
                      onClick={() => navigate(`/hr/employees/${emp.phone}`)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 shrink-0">
                            {getInitials(emp.full_name)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{emp.full_name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 font-mono">{emp.phone}</td>
                      <td className="px-4 py-3.5 text-slate-700 font-medium">
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-xs font-semibold">
                          {alloc} {alloc === 1 ? 'day' : 'days'} / mo
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/hr/employees/${emp.phone}`)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="View Profile"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => openEdit(emp)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddModal || !!editEmployee}
        onClose={closeModal}
        title={editEmployee ? 'Edit Employee' : 'Add New Employee'}
        size="md"
      >
        <div className="space-y-4">
          <Input label="Full Name *" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Arun Kumar" />
          <Input label="Phone Number *" type="tel" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 9876543210" />
          <Input label="Monthly Leave Allocation (Days / Month) *" type="number" step="0.5" min="0" value={form.leave_allocation} onChange={e => setForm({ ...form, leave_allocation: e.target.value })} placeholder="1" />
        </div>
        {formError && <p className="text-xs text-red-600 mt-3">{formError}</p>}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={closeModal}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>{editEmployee ? 'Save Changes' : 'Add Employee'}</Button>
        </div>
      </Modal>
    </div>
  )
}
