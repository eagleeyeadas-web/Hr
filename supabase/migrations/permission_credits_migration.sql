-- Create permission_credits table
CREATE TABLE IF NOT EXISTS public.permission_credits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_phone      TEXT NOT NULL REFERENCES public.employees(phone) ON DELETE CASCADE,
  credit_month        TEXT NOT NULL,
  monthly_credit_hours INTEGER NOT NULL DEFAULT 2,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_employee_month_permission UNIQUE (employee_phone, credit_month)
);

-- Enable Row Level Security
ALTER TABLE public.permission_credits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "HR can manage permission_credits" ON public.permission_credits;
DROP POLICY IF EXISTS "Employees can view own permission_credits" ON public.permission_credits;

-- Create policies
CREATE POLICY "HR can manage permission_credits" ON public.permission_credits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
  );

CREATE POLICY "Employees can view own permission_credits" ON public.permission_credits
  FOR SELECT USING (
    employee_phone IN (
      SELECT phone FROM public.employees WHERE phone = permission_credits.employee_phone
    )
  );

-- Create dynamic credit seeding function
CREATE OR REPLACE FUNCTION public.ensure_permission_credits(p_phone TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_joining_date DATE;
  v_start_month DATE;
  v_end_month DATE;
  v_month TEXT;
BEGIN
  -- Get joining date
  SELECT joining_date INTO v_joining_date
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
$$;

GRANT EXECUTE ON FUNCTION public.ensure_permission_credits(TEXT) TO authenticated;
