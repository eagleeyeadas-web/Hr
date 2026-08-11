import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Calendar, Search, Check, CheckCircle, AlertCircle,
  Clock, ArrowLeft, Users, ChevronLeft, ChevronRight, Info, ShieldAlert, RotateCcw
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import { PageLoader } from '../../components/ui/Spinner'
import { getInitials } from '../../lib/utils'
import { Modal } from '../../components/ui/Modal'
import toast from 'react-hot-toast'

export default function Attendance() {
  const [markDate, setMarkDate] = useState(new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [holidays, setHolidays] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Monthly summary modal state
  const [selectedSummaryEmp, setSelectedSummaryEmp] = useState(null)
  const [summaryData, setSummaryData] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear())
  const [summaryMonth, setSummaryMonth] = useState(new Date().getMonth()) // 0-indexed

  // Parse Year and Month from selected markDate
  const selectedYear = parseInt(markDate.slice(0, 4), 10)
  const selectedMonth = parseInt(markDate.slice(5, 7), 10) - 1 // 0-indexed

  // Fetch data for the selected date
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Fetch active employees
      const { data: emps, error: empsErr } = await supabase
        .from('employees')
        .select('phone, full_name, company, employee_type, leave_allocation')
        .order('full_name')
      if (empsErr) throw empsErr

      // 2. Fetch attendance for this specific date
      const { data: att, error: attErr } = await supabase
        .from('attendance')
        .select('*')
        .eq('attendance_date', markDate)
      if (attErr) throw attErr

      // 3. Fetch approved leave requests covering this date
      const { data: lvs, error: lvsErr } = await supabase
        .from('leave_requests')
        .select('employee_phone, start_date, end_date, leave_type')
        .eq('status', 'Approved')
        .lte('start_date', markDate)
        .gte('end_date', markDate)
      if (lvsErr) throw lvsErr

      // 4. Fetch government holidays for the selected month to see if current date is one
      const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`
      const startOfMonth = `${monthStr}-01`
      const endOfMonth = `${monthStr}-${new Date(selectedYear, selectedMonth + 1, 0).getDate()}`
      
      const { data: hols, error: holsErr } = await supabase
        .from('government_holidays')
        .select('*')
        .gte('holiday_date', startOfMonth)
        .lte('holiday_date', endOfMonth)
      if (holsErr) throw holsErr

      setEmployees(emps || [])
      setAttendance(att || [])
      setLeaves(lvs || [])
      setHolidays(hols || [])
    } catch (err) {
      console.error(err)
      toast.error('Failed to load attendance data.')
    } finally {
      setLoading(false)
    }
  }, [markDate, selectedYear, selectedMonth])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Get helper properties for current markDate
  const dateObj = useMemo(() => new Date(markDate + 'T00:00:00'), [markDate])
  const dayName = useMemo(() => dateObj.toLocaleString('default', { weekday: 'long' }), [dateObj])
  const dayOfWeek = useMemo(() => dateObj.getDay(), [dateObj]) // 0: Sun, 6: Sat

  const isCurrentDateHoliday = useMemo(() => {
    return holidays.some(h => h.holiday_date === markDate)
  }, [holidays, markDate])

  const currentHolidayDescription = useMemo(() => {
    return holidays.find(h => h.holiday_date === markDate)?.description || 'Government Holiday'
  }, [holidays, markDate])

  // Day type calculation: Government Holiday, Weekly Off, or Normal Working Day
  const getDayType = (empType) => {
    if (isCurrentDateHoliday) return 'Government Holiday'
    const isWeekend = dayOfWeek === 0 || (dayOfWeek === 6 && empType === 'Senior')
    return isWeekend ? 'Weekly Off' : 'Normal Working Day'
  }

  const overallDayType = useMemo(() => {
    if (isCurrentDateHoliday) return 'Government Holiday'
    // Display Weekly Off if it is Sunday generally (or Saturday for Seniors)
    if (dayOfWeek === 0) return 'Weekly Off'
    return 'Normal Working Day' // Seniors Saturday is Weekly Off, Junior Saturday is Working Day
  }, [isCurrentDateHoliday, dayOfWeek])

  // Process data maps for fast lookups
  const attendanceMap = useMemo(() => {
    const map = {}
    attendance.forEach(a => {
      map[a.employee_phone] = a.status // 'PRESENT' or 'ABSENT'
    })
    return map
  }, [attendance])

  const leavesMap = useMemo(() => {
    const map = {}
    leaves.forEach(l => {
      map[l.employee_phone] = l.leave_type
    })
    return map
  }, [leaves])

  // Navigation handlers for Target Date
  const handlePrevDay = () => {
    const prev = new Date(dateObj)
    prev.setDate(prev.getDate() - 1)
    setMarkDate(prev.toISOString().slice(0, 10))
  }

  const handleNextDay = () => {
    const next = new Date(dateObj)
    next.setDate(next.getDate() + 1)
    setMarkDate(next.toISOString().slice(0, 10))
  }

  // BULK ACTIONS
  const handleMarkAllPresent = async () => {
    const confirm = window.confirm(`Are you sure you want to mark all eligible employees as PRESENT on ${markDate}? Approved leaves will be skipped.`)
    if (!confirm) return

    setActionLoading(true)
    try {
      const records = []
      employees.forEach(emp => {
        // Skip approved leave
        if (leavesMap[emp.phone]) return
        records.push({
          employee_phone: emp.phone,
          attendance_date: markDate,
          status: 'PRESENT'
        })
      })

      if (records.length === 0) {
        toast.error('No eligible employees to update.')
        setActionLoading(false)
        return
      }

      const { error } = await supabase
        .from('attendance')
        .upsert(records, { onConflict: 'employee_phone,attendance_date' })

      if (error) throw error
      toast.success(`Successfully marked all as PRESENT!`)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to mark employees present.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleMarkAllAbsent = async () => {
    const confirm = window.confirm(`Are you sure you want to mark all eligible employees as ABSENT on ${markDate}? Approved leaves will be skipped.`)
    if (!confirm) return

    setActionLoading(true)
    try {
      const records = []
      employees.forEach(emp => {
        if (leavesMap[emp.phone]) return
        records.push({
          employee_phone: emp.phone,
          attendance_date: markDate,
          status: 'ABSENT'
        })
      })

      if (records.length === 0) {
        toast.error('No eligible employees to update.')
        setActionLoading(false)
        return
      }

      const { error } = await supabase
        .from('attendance')
        .upsert(records, { onConflict: 'employee_phone,attendance_date' })

      if (error) throw error
      toast.success(`Successfully marked all as ABSENT!`)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to mark employees absent.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleGovernmentHoliday = async () => {
    setActionLoading(true)
    try {
      if (isCurrentDateHoliday) {
        const confirm = window.confirm(`Remove government holiday status for ${markDate}? This will recalculate attendance balances.`)
        if (!confirm) { setActionLoading(false); return }

        const { error } = await supabase
          .from('government_holidays')
          .delete()
          .eq('holiday_date', markDate)
        if (error) throw error
        toast.success('Removed government holiday.')
      } else {
        const desc = window.prompt(`Enter description for government holiday on ${markDate}:`, 'Government Holiday')
        if (desc === null) { setActionLoading(false); return }

        const { error } = await supabase
          .from('government_holidays')
          .insert({
            holiday_date: markDate,
            description: desc.trim() || 'Government Holiday'
          })
        if (error) throw error
        toast.success('Marked as government holiday.')
      }
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to update holiday status.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReset = async () => {
    const confirm = window.confirm(`Reset attendance for ${markDate}? This deletes all custom attendance records and removes holiday status for this date.`)
    if (!confirm) return

    setActionLoading(true)
    try {
      // 1. Delete holiday if any
      if (isCurrentDateHoliday) {
        await supabase.from('government_holidays').delete().eq('holiday_date', markDate)
      }
      // 2. Delete attendance records
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('attendance_date', markDate)

      if (error) throw error
      toast.success('Reset attendance successfully.')
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to reset attendance.')
    } finally {
      setActionLoading(false)
    }
  }

  // INDIVIDUAL OVERRIDE
  const handleStatusChange = async (emp, newStatus) => {
    try {
      if (!newStatus) {
        // Reset status: delete from attendance table
        const { error } = await supabase
          .from('attendance')
          .delete()
          .eq('employee_phone', emp.phone)
          .eq('attendance_date', markDate)
        if (error) throw error
        toast.success(`Removed attendance override for ${emp.full_name}`)
      } else {
        // Upsert status
        const { error } = await supabase
          .from('attendance')
          .upsert({
            employee_phone: emp.phone,
            attendance_date: markDate,
            status: newStatus
          }, { onConflict: 'employee_phone,attendance_date' })
        if (error) throw error
        toast.success(`Marked ${emp.full_name} as ${newStatus}`)
      }
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to update employee status.')
    }
  }

  // MONTHLY SUMMARY COMPUTATION
  const fetchMonthlySummary = async (emp, year, month) => {
    setSummaryLoading(true)
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
      const startOfMonth = `${monthStr}-01`
      const endOfMonth = `${monthStr}-${new Date(year, month + 1, 0).getDate()}`

      // Fetch employee's attendance logs in this month
      const { data: attLogs } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_phone', emp.phone)
        .gte('attendance_date', startOfMonth)
        .lte('attendance_date', endOfMonth)

      // Fetch all approved leave requests for the employee
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_phone', emp.phone)
        .eq('status', 'Approved')

      // Fetch all approved comp-off requests for the employee
      const { data: compoffs } = await supabase
        .from('compoff_requests')
        .select('*')
        .eq('employee_phone', emp.phone)
        .eq('status', 'Approved')

      // Fetch all earned leave credits
      const { data: earnedCredits } = await supabase
        .from('earned_leave_credits')
        .select('*')
        .eq('employee_phone', emp.phone)

      // Fetch government holidays for this month
      const { data: hols } = await supabase
        .from('government_holidays')
        .select('*')
        .gte('holiday_date', startOfMonth)
        .lte('holiday_date', endOfMonth)

      // Calculate details
      const daysCount = new Date(year, month + 1, 0).getDate()
      const attendanceMap = {}
      ;(attLogs || []).forEach(a => {
        attendanceMap[a.attendance_date] = a.status
      })

      const holidaySet = new Set((hols || []).map(h => h.holiday_date))

      const leaveDaysSet = new Set()
      const compOffUsedDays = []
      const earnedLeaveUsedDays = []

      ;(leaves || []).forEach(req => {
        let curr = new Date(req.start_date)
        const end = new Date(req.end_date)
        while (curr <= end) {
          const dateStr = curr.toISOString().slice(0, 10)
          leaveDaysSet.add(dateStr)
          if (req.leave_type === 'Comp-Off') {
            compOffUsedDays.push(dateStr)
          } else if (req.leave_type === 'Earned Leave') {
            earnedLeaveUsedDays.push(dateStr)
          }
          curr.setDate(curr.getDate() + 1)
        }
      })

      let normalWorkingDays = 0
      let presentCount = 0
      let absentOrLeaveCount = 0
      let holidayCount = 0
      let weeklyOffCount = 0
      let compOffEarnedToday = 0

      for (let d = 1; d <= daysCount; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const dObj = new Date(year, month, d)
        const dow = dObj.getDay() // 0: Sun, 6: Sat
        const isHoliday = holidaySet.has(dateStr)
        const isWeeklyOff = !isHoliday && (dow === 0 || (dow === 6 && emp.employee_type === 'Senior'))

        if (isHoliday) {
          holidayCount++
        } else if (isWeeklyOff) {
          weeklyOffCount++
          if (attendanceMap[dateStr] === 'PRESENT') {
            compOffEarnedToday++
          }
        } else {
          normalWorkingDays++
          const status = attendanceMap[dateStr]
          const onLeave = leaveDaysSet.has(dateStr)

          if (status === 'PRESENT') {
            presentCount++
          } else if (status === 'ABSENT' || onLeave) {
            absentOrLeaveCount++
          }
        }
      }

      // Monthly Credits
      const ledgerRecord = (earnedCredits || []).find(r => r.credit_month === monthStr)
      const earnedLeaveCalculated = ledgerRecord?.earned_credits ?? Math.floor(presentCount / 15)

      const compOffUsedThisMonth = compOffUsedDays.filter(d => d.startsWith(monthStr)).length
      const earnedLeaveUsedThisMonth = earnedLeaveUsedDays.filter(d => d.startsWith(monthStr)).length

      // Cumulative Balance calculations
      const totalEarnedCredits = (earnedCredits || []).reduce((sum, row) => sum + (row.earned_credits || 0), 0)
      const totalEarnedLeaveUsed = (leaves || []).filter(r => r.leave_type === 'Earned Leave').reduce((sum, r) => sum + (r.total_days || 0), 0)
      const currentEarnedLeaveBalance = Math.max(0, (emp.leave_allocation ?? 0) + totalEarnedCredits - totalEarnedLeaveUsed)

      const totalCompOffCredits = (compoffs || []).reduce((sum, row) => sum + (row.credited_days || 1), 0)
      const totalCompOffUsed = (leaves || []).filter(r => r.leave_type === 'Comp-Off').reduce((sum, r) => sum + (r.total_days || 0), 0)
      const currentCompOffBalance = Math.max(0, totalCompOffCredits - totalCompOffUsed)

      setSummaryData({
        employee: emp,
        monthStr: new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
        normalWorkingDays,
        present: presentCount,
        absentOrLeave: absentOrLeaveCount,
        holidays: holidayCount,
        weeklyOffs: weeklyOffCount,
        earnedLeaveEarned: earnedLeaveCalculated,
        compOffEarned: compOffEarnedToday,
        compOffUsed: compOffUsedThisMonth,
        earnedLeaveUsed: earnedLeaveUsedThisMonth,
        currentEarnedLeaveBalance,
        currentCompOffBalance
      })
    } catch (err) {
      console.error(err)
      toast.error('Failed to compute monthly summary.')
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleOpenSummary = (emp) => {
    setSelectedSummaryEmp(emp)
    fetchMonthlySummary(emp, summaryYear, summaryMonth)
  }

  const handleMonthChange = (direction) => {
    let nextMonth = summaryMonth + direction
    let nextYear = summaryYear
    if (nextMonth < 0) {
      nextMonth = 11
      nextYear--
    } else if (nextMonth > 11) {
      nextMonth = 0
      nextYear++
    }
    setSummaryMonth(nextMonth)
    setSummaryYear(nextYear)
    if (selectedSummaryEmp) {
      fetchMonthlySummary(selectedSummaryEmp, nextYear, nextMonth)
    }
  }

  // Filter employees matching search and company
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const nameMatch = !search || emp.full_name?.toLowerCase().includes(search.toLowerCase()) || emp.phone?.includes(search)
      const companyMatch = !companyFilter || emp.company === companyFilter
      return nameMatch && companyMatch
    })
  }, [employees, search, companyFilter])

  // Count summaries
  const summaries = useMemo(() => {
    let present = 0
    let absent = 0
    let leave = 0
    let compoffEarned = 0

    filteredEmployees.forEach(emp => {
      if (leavesMap[emp.phone]) {
        leave++
      } else {
        const status = attendanceMap[emp.phone]
        if (status === 'PRESENT') {
          present++
          const rule = getDayType(emp.employee_type)
          if (rule === 'Weekly Off') {
            compoffEarned++
          }
        } else if (status === 'ABSENT') {
          absent++
        }
      }
    })

    return {
      present,
      absent,
      leave,
      compoffEarned,
      holidayCount: isCurrentDateHoliday ? 1 : 0
    }
  }, [filteredEmployees, attendanceMap, leavesMap, isCurrentDateHoliday, dayOfWeek])

  if (loading && employees.length === 0) return <PageLoader />

  return (
    <div className="space-y-6">
      {/* Target Date Header & Info Panel */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col lg:flex-row gap-5 items-stretch lg:items-center justify-between shadow-sm">
        {/* Date Selector Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={handlePrevDay} className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50/50 hover:bg-slate-50 transition-colors">
            <Calendar size={16} className="text-blue-600" />
            <input
              type="date"
              value={markDate}
              onChange={e => setMarkDate(e.target.value)}
              className="bg-transparent text-sm font-semibold focus:outline-none text-slate-800 cursor-pointer"
            />
          </div>
          <button onClick={handleNextDay} className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Selected Date Metadata */}
        <div className="flex flex-wrap items-center gap-6 text-sm bg-slate-50 rounded-2xl px-5 py-3.5 border border-slate-100 flex-1 justify-around lg:flex-initial">
          <div className="text-center lg:text-left">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Date</p>
            <p className="font-semibold text-slate-700">{markDate.split('-').reverse().join('-')}</p>
          </div>
          <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
          <div className="text-center lg:text-left">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Day</p>
            <p className="font-semibold text-slate-700">{dayName}</p>
          </div>
          <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
          <div className="text-center lg:text-left">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Day Type</p>
            <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full ${
              isCurrentDateHoliday ? 'bg-red-50 text-red-700' :
              dayOfWeek === 0 || dayOfWeek === 6 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
            }`}>
              {overallDayType}
            </span>
          </div>
        </div>

        {/* Reset Actions */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleReset}
            variant="secondary"
            loading={actionLoading}
            className="flex items-center gap-1.5 min-h-[44px] px-4 font-semibold text-red-600 border-red-100 hover:bg-red-50"
            title="Reset all logs for today"
          >
            <RotateCcw size={16} /> Reset
          </Button>
        </div>
      </div>

      {/* Bulk Actions Panel */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bulk Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleMarkAllPresent}
            loading={actionLoading}
            variant="success"
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 min-h-[44px] font-semibold text-sm"
          >
            <CheckCircle size={16} /> Mark All Present
          </Button>
          <Button
            onClick={handleMarkAllAbsent}
            loading={actionLoading}
            variant="danger"
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 min-h-[44px] font-semibold text-sm"
          >
            <AlertCircle size={16} /> Mark All Absent
          </Button>
          <Button
            onClick={handleToggleGovernmentHoliday}
            loading={actionLoading}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 min-h-[44px] font-semibold text-sm ${
              isCurrentDateHoliday 
                ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <Info size={16} /> {isCurrentDateHoliday ? 'Remove Government Holiday' : 'Mark Government Holiday'}
          </Button>
        </div>
        {isCurrentDateHoliday && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2.5 text-xs text-red-800 font-medium">
            <ShieldAlert size={16} className="text-red-600 shrink-0" />
            <span>Today is persistently marked as a Government Holiday: <strong>{currentHolidayDescription}</strong>. Employees will be shown as Government Holiday and will not earn Comp-Off or count toward Earned Leave.</span>
          </div>
        )}
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employees by name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800"
          />
        </div>
        <div className="w-full sm:w-56">
          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-700 bg-white"
          >
            <option value="">All Companies</option>
            <option value="Aram">Aram</option>
            <option value="Eagle Eye">Eagle Eye</option>
          </select>
        </div>
      </div>

      {/* Summary Stats Footer Preview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase">Present</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{summaries.present}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase">Absent</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{summaries.absent}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase">On Approved Leave</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{summaries.leave}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase">Government Holiday</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{summaries.holidayCount}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center col-span-2 md:col-span-1">
          <p className="text-xs font-semibold text-slate-400 uppercase">Comp-Off Earned Today</p>
          <p className="text-2xl font-bold text-amber-500 mt-1">{summaries.compoffEarned}</p>
        </div>
      </div>

      {/* Date-Based Employee Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider text-left">
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Day Rule</th>
                <th className="px-6 py-4">Attendance Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-400 font-medium">
                    No active employees found matching the filters.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => {
                  const dayRule = getDayType(emp.employee_type)
                  const onLeave = leavesMap[emp.phone]
                  const status = attendanceMap[emp.phone]

                  return (
                    <tr key={emp.phone} className="hover:bg-slate-50/50 transition-colors">
                      {/* Name Card */}
                      <td className="px-6 py-4 flex items-center gap-3">
                        <button
                          onClick={() => handleOpenSummary(emp)}
                          className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-xs shrink-0 select-none hover:bg-blue-200 transition-colors"
                          title="Click to view Monthly Summary"
                        >
                          {getInitials(emp.full_name)}
                        </button>
                        <div className="min-w-0">
                          <button
                            onClick={() => handleOpenSummary(emp)}
                            className="font-semibold text-slate-800 hover:text-blue-600 transition-colors truncate block text-left"
                            title="Click to view Monthly Summary"
                          >
                            {emp.full_name}
                          </button>
                          <p className="text-[10px] text-slate-400 font-mono font-medium">{emp.phone} · {emp.company}</p>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="px-6 py-4">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          emp.employee_type === 'Senior' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                        }`}>
                          {emp.employee_type}
                        </span>
                      </td>

                      {/* Day Rule */}
                      <td className="px-6 py-4 font-semibold text-xs text-slate-500">
                        <span className={`inline-block px-2 py-0.5 rounded ${
                          dayRule === 'Weekly Off' ? 'bg-amber-50 text-amber-700' :
                          dayRule === 'Government Holiday' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {dayRule}
                        </span>
                      </td>

                      {/* Attendance Select */}
                      <td className="px-6 py-4">
                        {isCurrentDateHoliday ? (
                          <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                            🏛 Government Holiday
                          </span>
                        ) : onLeave ? (
                          <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5" title={`${onLeave} Approved`}>
                            🌴 Leave ({onLeave})
                          </span>
                        ) : (
                          <select
                            value={status || ''}
                            onChange={e => handleStatusChange(emp, e.target.value)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                              status === 'PRESENT' ? 'bg-emerald-500 text-white border-emerald-500' :
                              status === 'ABSENT' ? 'bg-red-500 text-white border-red-500' :
                              'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            <option value="" className="bg-white text-slate-600 font-medium">Select Attendance</option>
                            <option value="PRESENT" className="bg-white text-emerald-600 font-bold">Present</option>
                            <option value="ABSENT" className="bg-white text-red-600 font-bold">Absent</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MONTHLY SUMMARY MODAL */}
      <Modal
        isOpen={!!selectedSummaryEmp}
        onClose={() => { setSelectedSummaryEmp(null); setSummaryData(null) }}
        title="Monthly Attendance Summary"
        size="lg"
      >
        {selectedSummaryEmp && (
          <div className="space-y-6">
            {/* Modal Month Navigator */}
            <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3.5">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-xs">
                  {getInitials(selectedSummaryEmp.full_name)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{selectedSummaryEmp.full_name}</h3>
                  <p className="text-[10px] text-slate-400 font-mono font-medium">{selectedSummaryEmp.phone} · {selectedSummaryEmp.employee_type}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <button onClick={() => handleMonthChange(-1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <span className="font-bold text-slate-700 text-xs tracking-wide min-w-[100px] text-center">
                  {new Date(summaryYear, summaryMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => handleMonthChange(1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {summaryLoading || !summaryData ? (
              <div className="py-12 flex justify-center"><PageLoader /></div>
            ) : (
              <div className="space-y-5">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Working Days</p>
                    <p className="text-xl font-bold text-slate-700 mt-0.5">{summaryData.normalWorkingDays}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase">Present</p>
                    <p className="text-xl font-bold text-emerald-700 mt-0.5">{summaryData.present}</p>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-red-500 uppercase">Absent/Leave</p>
                    <p className="text-xl font-bold text-red-700 mt-0.5">{summaryData.absentOrLeave}</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-indigo-500 uppercase">Govt Holiday</p>
                    <p className="text-xl font-bold text-indigo-700 mt-0.5">{summaryData.holidays}</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-amber-500 uppercase">Weekly Offs</p>
                    <p className="text-xl font-bold text-amber-700 mt-0.5">{summaryData.weeklyOffs}</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-blue-500 uppercase">Earned Leave (EL)</p>
                    <p className="text-xl font-bold text-blue-700 mt-0.5">+{summaryData.earnedLeaveEarned}</p>
                  </div>
                </div>

                {/* Earning & Usage Breakdown */}
                <div className="border border-slate-100 rounded-xl overflow-hidden text-sm">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 font-bold text-slate-600 text-xs uppercase tracking-wider">
                    Credits Breakdown for {summaryData.monthStr}
                  </div>
                  <div className="divide-y divide-slate-100 px-4 py-1.5">
                    <div className="flex justify-between py-2">
                      <span className="text-slate-500 font-medium">Comp-Off (CO) Earned:</span>
                      <span className="font-bold text-slate-800">+{summaryData.compOffEarned} days</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-500 font-medium">Comp-Off (CO) Used:</span>
                      <span className="font-bold text-slate-800">-{summaryData.compOffUsed} days</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-500 font-medium">Earned Leave (EL) Used:</span>
                      <span className="font-bold text-slate-800">-{summaryData.earnedLeaveUsed} days</span>
                    </div>
                  </div>
                </div>

                {/* Cumulative Balances (Source of truth) */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-blue-100 mb-3">Persistent Ledger Balances</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-blue-200 uppercase">Earned Leave Balance</p>
                      <p className="text-2xl font-black mt-0.5">{summaryData.currentEarnedLeaveBalance} days</p>
                      <p className="text-[9px] text-blue-100 mt-1 opacity-80">Allocation + Earned Credits - Used Leaves</p>
                    </div>
                    <div className="border-l border-white/20 pl-4">
                      <p className="text-[10px] font-bold text-blue-200 uppercase">Comp-Off Balance</p>
                      <p className="text-2xl font-black mt-0.5">{summaryData.currentCompOffBalance} days</p>
                      <p className="text-[9px] text-blue-100 mt-1 opacity-80">Weekend Present Credits - Used Comp-Offs</p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2.5 text-xs text-amber-800 leading-normal">
                  <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    Earned Leave is generated dynamically: <strong>floor(normal working days present / 15)</strong>. Current Earned Leave balance and Comp-Off balance carry forward across months persistently. Unused Permission hours do not carry forward.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
