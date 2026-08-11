-- Fix trigger_recalculate_earned_leave to support both work_logs and attendance tables dynamically
CREATE OR REPLACE FUNCTION public.trigger_recalculate_earned_leave()
RETURNS TRIGGER AS $$
DECLARE
  v_old_date DATE;
  v_new_date DATE;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'work_logs' THEN
      v_new_date := NEW.work_date;
    ELSE
      v_new_date := NEW.attendance_date;
    END IF;
    PERFORM public.calculate_earned_leave(NEW.employee_phone, TO_CHAR(v_new_date, 'YYYY-MM'));
  END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'work_logs' THEN
      v_old_date := OLD.work_date;
    ELSE
      v_old_date := OLD.attendance_date;
    END IF;
    
    -- Check if OLD record fields are different from NEW on UPDATE to avoid redundant calls
    IF TG_OP = 'DELETE' OR 
       OLD.employee_phone IS DISTINCT FROM NEW.employee_phone OR 
       v_old_date IS DISTINCT FROM v_new_date THEN
      PERFORM public.calculate_earned_leave(OLD.employee_phone, TO_CHAR(v_old_date, 'YYYY-MM'));
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
