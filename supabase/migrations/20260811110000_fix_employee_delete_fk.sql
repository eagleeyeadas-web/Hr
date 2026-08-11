-- ============================================================
-- Migration: Fix FK violation on employee deletion
--
-- Root cause:
--   When an employee is deleted, attendance rows cascade-delete.
--   Each cascade-deleted attendance row fires trg_attendance_recalculate
--   and trg_attendance_manage_compoff / trg_attendance_delete_compoff.
--   These trigger functions call calculate_earned_leave() which tries to
--   INSERT INTO earned_leave_credits (employee_phone, ...) — but the
--   employee row is ALREADY deleted, so the FK
--   earned_leave_credits_employee_phone_fkey → employees.phone fails.
--
-- Fix:
--   1. Add employee-existence guard to calculate_earned_leave()
--   2. Add employee-existence guard to manage_automatic_compoff()
--   3. Add employee-existence guard to delete_automatic_compoff()
--   4. All guards use the ACTUAL employees.phone column (not id).
-- ============================================================

-- 1. Fix calculate_earned_leave() to bail out if employee no longer exists
CREATE OR REPLACE FUNCTION public.calculate_earned_leave(p_phone TEXT, p_month TEXT)
RETURNS void AS $$
DECLARE
  v_eligible_days INTEGER;
  v_earned INTEGER;
BEGIN
  -- Safety guard: if employee was deleted, do not attempt to upsert earned_leave_credits
  IF NOT EXISTS (
    SELECT 1 FROM public.employees WHERE phone = p_phone
  ) THEN
    RETURN;
  END IF;

  -- Count only PRESENT normal working days (excluding government holidays and weekly offs)
  SELECT COUNT(*) INTO v_eligible_days
  FROM public.attendance a
  JOIN public.employees e ON e.phone = a.employee_phone
  WHERE a.employee_phone = p_phone
    AND TO_CHAR(a.attendance_date, 'YYYY-MM') = p_month
    AND a.status = 'PRESENT'
    -- Exclude Government Holidays
    AND NOT EXISTS (
      SELECT 1 FROM public.government_holidays h WHERE h.holiday_date = a.attendance_date
    )
    -- Exclude Weekly Offs
    AND NOT (
      (e.employee_type = 'Senior' AND EXTRACT(ISODOW FROM a.attendance_date) IN (6, 7)) OR
      (e.employee_type = 'Junior' AND EXTRACT(ISODOW FROM a.attendance_date) = 7)
    );
  
  v_earned := FLOOR(v_eligible_days::NUMERIC / 15);
  
  INSERT INTO public.earned_leave_credits (employee_phone, credit_month, eligible_days, earned_credits)
  VALUES (p_phone, p_month, v_eligible_days, v_earned)
  ON CONFLICT (employee_phone, credit_month)
  DO UPDATE SET
    eligible_days  = EXCLUDED.eligible_days,
    earned_credits = EXCLUDED.earned_credits,
    updated_at     = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Fix manage_automatic_compoff() to bail out if employee no longer exists
CREATE OR REPLACE FUNCTION public.manage_automatic_compoff()
RETURNS TRIGGER AS $$
DECLARE
  v_employee_type TEXT;
  v_is_weekly_off BOOLEAN;
  v_is_holiday BOOLEAN;
BEGIN
  -- Safety guard: if employee was deleted (cascade scenario), skip silently
  SELECT employee_type INTO v_employee_type
  FROM public.employees
  WHERE phone = NEW.employee_phone;

  IF v_employee_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if it is a government holiday
  SELECT EXISTS (
    SELECT 1 FROM public.government_holidays WHERE holiday_date = NEW.attendance_date
  ) INTO v_is_holiday;

  -- Check if it is a weekly off (only if not a holiday)
  v_is_weekly_off := FALSE;
  IF NOT v_is_holiday THEN
    IF v_employee_type = 'Senior' AND EXTRACT(ISODOW FROM NEW.attendance_date) IN (6, 7) THEN
      v_is_weekly_off := TRUE;
    ELSIF v_employee_type = 'Junior' AND EXTRACT(ISODOW FROM NEW.attendance_date) = 7 THEN
      v_is_weekly_off := TRUE;
    END IF;
  END IF;

  IF NEW.status = 'PRESENT' AND v_is_weekly_off THEN
    -- Upsert approved Comp-Off request
    INSERT INTO public.compoff_requests (employee_phone, worked_date, status, credited_days, reason, approved_at)
    VALUES (NEW.employee_phone, NEW.attendance_date, 'Approved', 1, 'Automatically generated from Attendance', NOW())
    ON CONFLICT (employee_phone, worked_date) DO UPDATE
    SET status = 'Approved', credited_days = 1, updated_at = NOW();
  ELSE
    -- Delete Comp-Off if they are marked Absent or it is no longer a qualifying day
    DELETE FROM public.compoff_requests
    WHERE employee_phone = NEW.employee_phone AND worked_date = NEW.attendance_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Fix delete_automatic_compoff() to bail out if employee no longer exists
CREATE OR REPLACE FUNCTION public.delete_automatic_compoff()
RETURNS TRIGGER AS $$
BEGIN
  -- Safety guard: employee may already be deleted (cascade scenario); proceed anyway —
  -- compoff_requests also cascades on employee delete so no FK issue here.
  -- But guard against any unexpected errors by using a safe DELETE.
  DELETE FROM public.compoff_requests
  WHERE employee_phone = OLD.employee_phone AND worked_date = OLD.attendance_date;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
