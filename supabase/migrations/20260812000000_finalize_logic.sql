-- ============================================================
-- SQL Migration: Finalize Attendance, Leave, LOP, Earned Leave, Comp-Off, and Permission Logic
-- ============================================================

-- 1. Drop the old check constraint first so we can update the status values without violations
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;

-- 2. Migrate existing 'ABSENT' records to 'LOP' in the attendance table
UPDATE public.attendance 
SET status = 'LOP' 
WHERE status = 'ABSENT';

-- 3. Add a new check constraint for allowed statuses
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check 
  CHECK (status IN ('PRESENT', 'LEAVE', 'LOP', 'GOVERNMENT HOLIDAY'));

-- 3. Trigger & Function to sync Government Holidays with automatic Comp-Offs
CREATE OR REPLACE FUNCTION public.trigger_recalculate_compoff_holiday()
RETURNS TRIGGER AS $$
DECLARE
  v_rec RECORD;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- If a date becomes a Government Holiday, delete any automatic Comp-Off requests
    DELETE FROM public.compoff_requests 
    WHERE worked_date = NEW.holiday_date;
  END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    -- If a Government Holiday is removed/updated, recreate Comp-Off requests for employees who were PRESENT on that date (if it qualifies as weekly off)
    FOR v_rec IN 
      SELECT a.employee_phone, a.attendance_date, e.employee_type
      FROM public.attendance a
      JOIN public.employees e ON e.phone = a.employee_phone
      WHERE a.attendance_date = OLD.holiday_date
        AND a.status = 'PRESENT'
    LOOP
      IF (v_rec.employee_type = 'Senior' AND EXTRACT(ISODOW FROM v_rec.attendance_date) IN (6, 7)) OR
         (v_rec.employee_type = 'Junior' AND EXTRACT(ISODOW FROM v_rec.attendance_date) = 7) THEN
        
        INSERT INTO public.compoff_requests (employee_phone, worked_date, status, credited_days, reason, approved_at)
        VALUES (v_rec.employee_phone, v_rec.attendance_date, 'Approved', 1, 'Automatically regenerated after holiday removal', NOW())
        ON CONFLICT (employee_phone, worked_date) DO UPDATE
        SET status = 'Approved', credited_days = 1, updated_at = NOW();
      END IF;
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_government_holidays_compoff ON public.government_holidays;
CREATE TRIGGER trg_government_holidays_compoff
  AFTER INSERT OR UPDATE OR DELETE ON public.government_holidays
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculate_compoff_holiday();

-- 4. Re-calculate Earned Leave Credits Function - update status criteria to count 'PRESENT'
-- (Excluding Government Holidays and Weekly Offs)
CREATE OR REPLACE FUNCTION public.calculate_earned_leave(p_phone TEXT, p_month TEXT)
RETURNS void AS $$
DECLARE
  v_eligible_days INTEGER;
  v_earned INTEGER;
BEGIN
  -- Safety guard: if employee was deleted, skip
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


-- 5. Keep existing working RLS policies intact (custom phone-based login uses anonymous DB role)
