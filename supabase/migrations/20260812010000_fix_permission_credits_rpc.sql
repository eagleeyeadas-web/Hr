-- Fix ensure_permission_credits function to use created_at instead of non-existent joining_date
CREATE OR REPLACE FUNCTION public.ensure_permission_credits(p_phone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_joining_date DATE;
  v_start_month DATE;
  v_end_month DATE;
  v_month TEXT;
BEGIN
  -- Get joining date from created_at
  SELECT COALESCE(created_at::date, CURRENT_DATE) INTO v_joining_date
  FROM public.employees
  WHERE phone = p_phone;
  
  IF v_joining_date IS NULL THEN
    v_joining_date := CURRENT_DATE;
  END IF;

  v_start_month := DATE_TRUNC('month', v_joining_date)::DATE;
  v_end_month := DATE_TRUNC('month', CURRENT_DATE)::DATE;

  FOR v_month IN 
    SELECT TO_CHAR(m, 'YYYY-MM')
    FROM GENERATE_SERIES(v_start_month::TIMESTAMP, v_end_month::TIMESTAMP, '1 month'::INTERVAL) m
  LOOP
    INSERT INTO public.permission_credits (employee_phone, credit_month, monthly_credit_hours)
    VALUES (p_phone, v_month, 2)
    ON CONFLICT (employee_phone, credit_month) DO NOTHING;
  END LOOP;
END;
$function$;
