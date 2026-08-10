import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, Search, Filter, Check, CheckCircle, AlertCircle,
  Clock, ArrowLeft, Users, ChevronLeft, ChevronRight
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import { PageLoader } from '../../components/ui/Spinner'
import { getInitials } from '../../lib/utils'
import toast from 'react-hot-toast'

export default function Attendance() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-indexed
  const [markDate, setMarkDate] = useState(today.toISOString().slice(0, 10))
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  
  const [employees, setEmployees] = useState([])
  const [workLogs, setWorkLogs] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Fetch all relevant data for the selected month/year
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
      const startOfMonth = `${monthStr}-01`
      const endOfMonth = `${monthStr}-${new Date(year, month + 1, 0).getDate()}`

      // 1. Fetch active employees
      const { data: emps, error: empsErr } = await supabase
        .from('employees')
        .select('full_name, phone, company, employee_type')
        .order('full_name')

      if (empsErr) throw empsErr

      // 2. Fetch work logs for the month
      const { data: logs, error: logsErr } = await supabase
        .from('work_logs')
        .select('employee_phone, work_date')
        .gte('work_date', startOfMonth)
        .lte('work_date', endOfMonth)

      if (logsErr) throw logsErr

      // 3. Fetch approved leave requests for the month
      const { data: lvs, error: lvsErr } = await supabase
        .from('leave_requests')
        .select('employee_phone, start_date, end_date, leave_type')
        .eq('status', 'Approved')
        .lte('start_date', endOfMonth)
        .gte('end_date', startOfMonth)

      if (lvsErr) throw lvsErr

      setEmployees(emps || [])
      setWorkLogs(logs || [])
      setLeaves(lvs || [])
    } catch (err) {
      console.error(err)
      toast.error('Failed to load attendance data.')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Process data into maps for fast O(1) cell lookup
  const workLogsMap = {} // key: phone, value: Set of dates
  workLogs.forEach(l => {
    if (!workLogsMap[l.employee_phone]) workLogsMap[l.employee_phone] = new Set()
    workLogsMap[l.employee_phone].add(l.work_date)
  })

  const leavesMap = {} // key: phone, value: Set of dates
  leaves.forEach(req => {
    const phone = req.employee_phone
    if (!phone) return
    if (!leavesMap[phone]) leavesMap[phone] = new Set()

    let curr = new Date(req.start_date)
    const end = new Date(req.end_date)
    while (curr <= end) {
      const dateStr = curr.toISOString().slice(0, 10)
      leavesMap[phone].add(dateStr)
      curr.setDate(curr.getDate() + 1)
    }
  })

  // Calendar dates details
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Filter employees
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = !search ||
      emp.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      emp.phone?.toLowerCase().includes(search.toLowerCase())
    const matchesCompany = !companyFilter || emp.company === companyFilter
    return matchesSearch && matchesCompany
  })

  // Determine status for a cell
  const getCellStatus = (emp, dayNum) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    
    // Check Leave
    if (leavesMap[emp.phone]?.has(dateStr)) {
      return 'L' // Leave
    }

    // Check Present
    if (workLogsMap[emp.phone]?.has(dateStr)) {
      return 'P' // Present
    }

    // Determine weekend/Off based on employee type
    const dateObj = new Date(year, month, dayNum)
    const dayOfWeek = dateObj.getDay() // 0: Sunday, 6: Saturday

    const isWeekend = dayOfWeek === 0 || (dayOfWeek === 6 && emp.employee_type === 'Senior')
    
    return isWeekend ? 'O' : 'A' // Off or Absent
  }

  // Toggle cell Present <-> Absent/Off
  const handleCellClick = async (emp, dayNum) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    const currentStatus = getCellStatus(emp, dayNum)

    if (currentStatus === 'L') {
      toast.error('Approved leave cannot be toggled manually. Update the leave request instead.')
      return
    }

    // Optimistic UI Update
    const newLogs = [...workLogs]
    if (currentStatus === 'P') {
      // Toggle to Absent: delete work log
      setWorkLogs(workLogs.filter(l => !(l.employee_phone === emp.phone && l.work_date === dateStr)))
      try {
        const { error } = await supabase
          .from('work_logs')
          .delete()
          .eq('employee_phone', emp.phone)
          .eq('work_date', dateStr)

        if (error) throw error
        toast.success(`Marked ${emp.full_name} as Absent on ${dayNum}`)
      } catch (err) {
        toast.error('Failed to update attendance.')
        setWorkLogs(newLogs) // Rollback
      }
    } else {
      // Toggle to Present: insert work log
      setWorkLogs([...workLogs, { employee_phone: emp.phone, work_date: dateStr }])
      try {
        const { error } = await supabase
          .from('work_logs')
          .insert({ employee_phone: emp.phone, work_date: dateStr })

        if (error) throw error
        toast.success(`Marked ${emp.full_name} as Present on ${dayNum}`)
      } catch (err) {
        toast.error('Failed to update attendance.')
        setWorkLogs(newLogs) // Rollback
      }
    }
  }

  // Bulk: Mark All Present for Selected Date
  const handleMarkAllPresent = async () => {
    if (!markDate) {
      toast.error('Please select a date to mark all present.')
      return
    }

    const confirm = window.confirm(`Are you sure you want to mark all eligible employees as Present on ${markDate}? This will not overwrite existing approved leaves.`)
    if (!confirm) return

    setActionLoading(true)
    try {
      const recordsToInsert = []

      for (const emp of employees) {
        // Skip if they are on approved leave on that date
        const hasLeave = leavesMap[emp.phone]?.has(markDate)
        if (hasLeave) continue

        recordsToInsert.push({
          employee_phone: emp.phone,
          work_date: markDate
        })
      }

      if (recordsToInsert.length === 0) {
        toast.error('No eligible employees to mark present.')
        return
      }

      const { error } = await supabase
        .from('work_logs')
        .upsert(recordsToInsert, { onConflict: 'employee_phone,work_date' })

      if (error) throw error

      toast.success(`Successfully marked ${recordsToInsert.length} employees as Present!`)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to bulk mark present.')
    } finally {
      setActionLoading(false)
    }
  }

  // Month navigation
  const prevMonth = () => {
    if (month === 0) {
      setMonth(11)
      setYear(y => y - 1)
    } else {
      setMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0)
      setYear(y => y + 1)
    } else {
      setMonth(m => m + 1)
    }
  }

  const monthLabel = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' })

  if (loading) return <PageLoader />

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 sm:p-5 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Month Selector */}
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="font-bold text-slate-800 text-lg min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Bulk Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
            <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Target Date:</label>
            <input
              type="date"
              value={markDate}
              onChange={e => setMarkDate(e.target.value)}
              className="bg-transparent text-sm font-semibold focus:outline-none text-slate-700 cursor-pointer"
            />
          </div>
          <Button
            onClick={handleMarkAllPresent}
            loading={actionLoading}
            variant="success"
            className="flex items-center justify-center gap-1.5"
          >
            <CheckCircle size={16} /> Mark All Present
          </Button>
        </div>
      </div>

      {/* Toolbar Filters */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employees by name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-700 bg-white"
          >
            <option value="">All Companies</option>
            <option value="Aram">Aram</option>
            <option value="Eagle Eye">Eagle Eye</option>
          </select>
        </div>
      </div>

      {/* Legend Block */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap items-center gap-4 text-xs font-semibold">
        <span className="text-slate-400 uppercase tracking-wider text-[10px]">Legend:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-6 h-6 flex items-center justify-center rounded bg-emerald-500 text-white text-[10px]">P</span>
          <span className="text-slate-500">Present</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-6 h-6 flex items-center justify-center rounded bg-red-500 text-white text-[10px]">A</span>
          <span className="text-slate-500">Absent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-6 h-6 flex items-center justify-center rounded bg-rose-500 text-white text-[10px]">L</span>
          <span className="text-slate-500">Approved Leave</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-6 h-6 flex items-center justify-center rounded bg-slate-200 text-slate-500 text-[10px]">O</span>
          <span className="text-slate-500">Weekend / Off</span>
        </div>
      </div>

      {/* Bulk Attendance Grid */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3 text-left sticky left-0 bg-slate-50 border-r border-slate-100 z-10 min-w-[200px]">Employee</th>
                <th className="px-4 py-3 text-center min-w-[90px]">Type</th>
                <th className="px-4 py-3 text-center min-w-[100px]">Company</th>
                {daysArray.map(day => (
                  <th key={day} className="px-2 py-3 text-center min-w-[36px]">{day}</th>
                ))}
                <th className="px-4 py-3 text-center sticky right-0 bg-slate-50 border-l border-slate-100 z-10 min-w-[100px]">Worked Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 4} className="text-center py-10 text-slate-400 font-semibold">
                    No active employees found matching the filters.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => {
                  const workedDaysCount = daysArray.reduce((acc, d) => {
                    const st = getCellStatus(emp, d)
                    return acc + (st === 'P' ? 1 : 0)
                  }, 0)

                  return (
                    <tr key={emp.phone} className="hover:bg-slate-50/50 transition-colors">
                      {/* Name Card */}
                      <td className="px-5 py-3.5 sticky left-0 bg-white border-r border-slate-100 font-medium text-slate-800 z-10 flex items-center gap-3 min-w-[200px]">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-xs shrink-0">
                          {getInitials(emp.full_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{emp.full_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{emp.phone}</p>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="px-4 py-3.5 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          emp.employee_type === 'Senior' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                        }`}>
                          {emp.employee_type}
                        </span>
                      </td>

                      {/* Company Badge */}
                      <td className="px-4 py-3.5 text-center text-xs font-semibold text-slate-500">
                        {emp.company}
                      </td>

                      {/* Days Grid Cells */}
                      {daysArray.map(dayNum => {
                        const status = getCellStatus(emp, dayNum)

                        const statusClasses = {
                          P: 'bg-emerald-500 text-white font-bold',
                          A: 'bg-red-500 text-white font-bold',
                          L: 'bg-rose-500 text-white font-bold cursor-not-allowed opacity-80',
                          O: 'bg-slate-100 text-slate-400 font-medium'
                        }

                        return (
                          <td key={dayNum} className="p-0.5 text-center">
                            <button
                              onClick={() => handleCellClick(emp, dayNum)}
                              className={`w-7 h-7 mx-auto rounded flex items-center justify-center text-xs select-none transition-all ${statusClasses[status]} hover:brightness-105 active:scale-95`}
                            >
                              {status}
                            </button>
                          </td>
                        )
                      })}

                      {/* Total Worked Days */}
                      <td className="px-4 py-3.5 sticky right-0 bg-white border-l border-slate-100 text-center font-bold text-slate-800 z-10 min-w-[100px]">
                        <span className="text-sm px-2.5 py-1 bg-slate-100 rounded-full text-slate-700">
                          {workedDaysCount} days
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
