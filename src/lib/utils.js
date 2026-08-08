import { format, parseISO, differenceInCalendarDays, addDays, isWeekend } from 'date-fns'

/**
 * Format a date string as 'dd MMM yyyy' (e.g., 08 Aug 2026)
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy')
  } catch {
    return dateStr
  }
}

/**
 * Format a date string as 'yyyy-MM-dd' for input[type=date]
 */
export function toInputDate(dateStr) {
  if (!dateStr) return ''
  try {
    return format(parseISO(dateStr), 'yyyy-MM-dd')
  } catch {
    return dateStr
  }
}

/**
 * Format a time string (HH:mm:ss or HH:mm) to '2:00 PM'
 */
export function formatTime(timeStr) {
  if (!timeStr) return '—'
  try {
    const [hours, minutes] = timeStr.split(':')
    const h = parseInt(hours, 10)
    const m = minutes || '00'
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    return `${h12}:${m} ${ampm}`
  } catch {
    return timeStr
  }
}

/**
 * Format duration in minutes to 'X hrs Y mins' or 'X hrs'
 */
export function formatDuration(minutes) {
  if (!minutes) return '0 mins'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min${m !== 1 ? 's' : ''}`
  if (m === 0) return `${h} hr${h !== 1 ? 's' : ''}`
  return `${h} hr${h !== 1 ? 's' : ''} ${m} min${m !== 1 ? 's' : ''}`
}

/**
 * Calculate working days between two dates (inclusive)
 * Excludes weekends. For simplicity, no holiday exclusion.
 */
export function calculateWorkingDays(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (start > end) return 0
  let count = 0
  let current = start
  while (current <= end) {
    if (!isWeekend(current)) count++
    current = addDays(current, 1)
  }
  return count
}

/**
 * Calculate calendar days between two dates (inclusive)
 */
export function calculateCalendarDays(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const diff = differenceInCalendarDays(new Date(endDate), new Date(startDate))
  return Math.max(0, diff + 1)
}

/**
 * Calculate duration in minutes between two time strings (HH:mm)
 */
export function calculateDurationMinutes(startTime, endTime) {
  if (!startTime || !endTime) return 0
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm))
}

/**
 * Get date range based on filter string
 */
export function getDateRange(filter) {
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')

  if (filter === 'today') {
    return { start: today, end: today }
  }
  if (filter === 'week') {
    const day = now.getDay()
    const diffToMonday = (day === 0 ? -6 : 1 - day)
    const monday = new Date(now)
    monday.setDate(now.getDate() + diffToMonday)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { start: format(monday, 'yyyy-MM-dd'), end: format(sunday, 'yyyy-MM-dd') }
  }
  if (filter === 'month') {
    const start = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
    const end = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd')
    return { start, end }
  }
  if (filter === 'year') {
    return {
      start: `${now.getFullYear()}-01-01`,
      end: `${now.getFullYear()}-12-31`,
    }
  }
  return { start: null, end: null }
}

/**
 * Truncate a string to max length
 */
export function truncate(str, max = 60) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

/**
 * cn — className merger (clsx + tailwind-merge)
 */
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Generate initials from full name
 */
export function getInitials(name = '') {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export const DEPARTMENTS = [
  'Administration',
  'Development',
  'Design',
  'Marketing',
  'Sales',
  'Finance',
  'HR',
  'Operations',
  'Customer Support',
  'Legal',
  'IT',
  'Other',
]

export const LEAVE_TYPES = [
  'Casual Leave',
  'Sick Leave',
  'Earned Leave',
  'Emergency Leave',
  'Loss of Pay',
  'Other',
]

export const REQUEST_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled']
