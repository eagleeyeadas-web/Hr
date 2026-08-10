DROP POLICY IF EXISTS "HR can manage work_logs" ON public.work_logs;
CREATE POLICY "HR can manage work_logs" ON public.work_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
  );
