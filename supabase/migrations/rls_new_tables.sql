ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earned_leave_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can manage work_logs" ON public.work_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
  );

CREATE POLICY "Employees can view own work_logs" ON public.work_logs
  FOR SELECT USING (
    employee_phone IN (
      SELECT phone FROM public.employees WHERE phone = work_logs.employee_phone
    )
  );

CREATE POLICY "HR can manage earned_leave_credits" ON public.earned_leave_credits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
  );

CREATE POLICY "Employees can view own earned_leave_credits" ON public.earned_leave_credits
  FOR SELECT USING (
    employee_phone IN (
      SELECT phone FROM public.employees WHERE phone = earned_leave_credits.employee_phone
    )
  );
