-- ============================================================
-- HR Attendance System Rework Migration
-- ============================================================

-- 1. Create Government Holidays Table
CREATE TABLE IF NOT EXISTS public.government_holidays (
  holiday_date DATE PRIMARY KEY,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Government Holidays
ALTER TABLE public.government_holidays ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view government holidays" ON public.government_holidays;
DROP POLICY IF EXISTS "HR can manage government holidays" ON public.government_holidays;

-- Anyone authenticated can view government holidays
CREATE POLICY "Anyone can view government holidays" ON public.government_holidays
  FOR SELECT USING (true);

-- Only HR/admin roles can write/update/delete government holidays
CREATE POLICY "HR can manage government holidays" ON public.government_holidays
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
  );


-- 2. Create Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
  employee_phone TEXT NOT NULL REFERENCES public.employees(phone) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (employee_phone, attendance_date)
);

-- Enable RLS for Attendance
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Employees can view own attendance" ON public.attendance;
DROP POLICY IF EXISTS "HR can manage attendance" ON public.attendance;

-- Employees can view their own attendance records
CREATE POLICY "Employees can view own attendance" ON public.attendance
  FOR SELECT USING (
    employee_phone IN (
      SELECT phone FROM public.employees WHERE phone = attendance.employee_phone
    )
  );

-- HR/admin can manage all attendance records
CREATE POLICY "HR can manage attendance" ON public.attendance
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
  );


-- 3. Copy historical work logs into attendance table as PRESENT
INSERT INTO public.attendance (employee_phone, attendance_date, status, created_by, created_at)
SELECT employee_phone, work_date, 'PRESENT', created_by, created_at
FROM public.work_logs
ON CONFLICT (employee_phone, attendance_date) DO NOTHING;


-- 4. Re-calculate Earned Leave Credits Function
CREATE OR REPLACE FUNCTION public.calculate_earned_leave(p_phone TEXT, p_month TEXT)
RETURNS void AS $$
DECLARE
  v_eligible_days INTEGER;
  v_earned INTEGER;
BEGIN
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


-- 5. Trigger to Recalculate Earned Leave when Attendance is modified
CREATE OR REPLACE FUNCTION public.trigger_recalculate_earned_leave()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.calculate_earned_leave(NEW.employee_phone, TO_CHAR(NEW.attendance_date, 'YYYY-MM'));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.calculate_earned_leave(OLD.employee_phone, TO_CHAR(OLD.attendance_date, 'YYYY-MM'));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_attendance_recalculate ON public.attendance;
CREATE TRIGGER trg_attendance_recalculate
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculate_earned_leave();


-- 6. Trigger to Recalculate Earned Leave when Government Holidays are modified
CREATE OR REPLACE FUNCTION public.trigger_recalculate_earned_leave_holiday()
RETURNS TRIGGER AS $$
DECLARE
  v_month TEXT;
  v_phone TEXT;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_month := TO_CHAR(NEW.holiday_date, 'YYYY-MM');
  ELSE
    v_month := TO_CHAR(OLD.holiday_date, 'YYYY-MM');
  END IF;

  FOR v_phone IN SELECT phone FROM public.employees LOOP
    PERFORM public.calculate_earned_leave(v_phone, v_month);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_government_holidays_recalculate ON public.government_holidays;
CREATE TRIGGER trg_government_holidays_recalculate
  AFTER INSERT OR UPDATE OR DELETE ON public.government_holidays
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculate_earned_leave_holiday();


-- 7. Trigger to Recalculate Earned Leave when Employee Type is changed
CREATE OR REPLACE FUNCTION public.trigger_recalculate_employee_earned_leave()
RETURNS TRIGGER AS $$
DECLARE
  v_month TEXT;
BEGIN
  IF OLD.employee_type IS DISTINCT FROM NEW.employee_type THEN
    FOR v_month IN SELECT DISTINCT credit_month FROM public.earned_leave_credits WHERE employee_phone = NEW.phone LOOP
      PERFORM public.calculate_earned_leave(NEW.phone, v_month);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_employees_type_recalculate ON public.employees;
CREATE TRIGGER trg_employees_type_recalculate
  AFTER UPDATE OF employee_type ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculate_employee_earned_leave();


-- 8. Trigger to Automatically Manage Comp-Off for Weekend Work
CREATE OR REPLACE FUNCTION public.manage_automatic_compoff()
RETURNS TRIGGER AS $$
DECLARE
  v_employee_type TEXT;
  v_is_weekly_off BOOLEAN;
  v_is_holiday BOOLEAN;
BEGIN
  -- Get employee type
  SELECT employee_type INTO v_employee_type
  FROM public.employees
  WHERE phone = NEW.employee_phone;

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

DROP TRIGGER IF EXISTS trg_attendance_manage_compoff ON public.attendance;
CREATE TRIGGER trg_attendance_manage_compoff
  AFTER INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.manage_automatic_compoff();


-- 9. Trigger to Delete Comp-Off when Attendance is deleted
CREATE OR REPLACE FUNCTION public.delete_automatic_compoff()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.compoff_requests
  WHERE employee_phone = OLD.employee_phone AND worked_date = OLD.attendance_date;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_attendance_delete_compoff ON public.attendance;
CREATE TRIGGER trg_attendance_delete_compoff
  AFTER DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.delete_automatic_compoff();
