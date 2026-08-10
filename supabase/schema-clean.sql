-- ============================================================
-- HR Leave & Permission Management System — Clean Schema
-- ============================================================
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- Drop old tables if they exist
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.permission_requests CASCADE;
DROP TABLE IF EXISTS public.leave_requests CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES (role management — links auth.users to roles)
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'hr', 'employee')) DEFAULT 'employee',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. EMPLOYEES
CREATE TABLE public.employees (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  phone             TEXT,
  department        TEXT NOT NULL,
  designation       TEXT NOT NULL,
  joining_date      DATE NOT NULL DEFAULT NOW()::DATE,
  date_of_birth     DATE,
  leave_allocation  INTEGER NOT NULL DEFAULT 12,
  status            TEXT NOT NULL CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  profile_photo_url TEXT,
  company           TEXT,
  employee_type     TEXT CHECK (employee_type IS NULL OR employee_type IN ('Senior', 'Junior')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 3. LEAVE REQUESTS
CREATE TABLE public.leave_requests (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id       UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type        TEXT NOT NULL CHECK (leave_type IN (
                      'Casual Leave', 'Sick Leave', 'Earned Leave',
                      'Emergency Leave', 'Loss of Pay', 'Comp-Off', 'Other'
                    )),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  total_days        INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  attachment_url    TEXT,
  status            TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')) DEFAULT 'Pending',
  rejection_reason  TEXT,
  approved_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  applied_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PERMISSION REQUESTS
CREATE TABLE public.permission_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  permission_date     DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  duration_minutes    INTEGER NOT NULL,
  reason              TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')) DEFAULT 'Pending',
  rejection_reason    TEXT,
  approved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  applied_at          TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 5. NOTIFICATIONS
CREATE TABLE public.notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_phone  TEXT,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('leave', 'permission', 'system', 'compoff')) DEFAULT 'system',
  is_read         BOOLEAN DEFAULT FALSE,
  related_id      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5b. PUSH SUBSCRIPTIONS
CREATE TABLE public.push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_phone  TEXT,
  subscription    JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_subscription UNIQUE (user_id, subscription),
  CONSTRAINT unique_employee_subscription UNIQUE (employee_phone, subscription)
);

-- 6. AUDIT LOGS
CREATE TABLE public.audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID NOT NULL,
  performed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details       JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 5c. COMP-OFF REQUESTS
CREATE TABLE public.compoff_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_phone  TEXT NOT NULL REFERENCES public.employees(phone) ON DELETE CASCADE,
  worked_date     DATE NOT NULL,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
  credited_days   INTEGER NOT NULL DEFAULT 1,
  approved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES for performance
CREATE INDEX idx_employees_auth_user_id    ON public.employees(auth_user_id);
CREATE INDEX idx_employees_department       ON public.employees(department);
CREATE INDEX idx_employees_status           ON public.employees(status);
CREATE INDEX idx_leave_requests_employee_id ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status      ON public.leave_requests(status);
CREATE INDEX idx_leave_requests_start_date  ON public.leave_requests(start_date);
CREATE INDEX idx_perm_requests_employee_id  ON public.permission_requests(employee_id);
CREATE INDEX idx_perm_requests_status       ON public.permission_requests(status);
CREATE INDEX idx_notifications_user_id      ON public.notifications(user_id);
CREATE INDEX idx_audit_logs_entity_id       ON public.audit_logs(entity_id);

-- AUTO-UPDATE updated_at TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_permission_requests_updated_at
  BEFORE UPDATE ON public.permission_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- AUTO-CREATE PROFILE AND EMPLOYEE ON AUTH SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Extract role from metadata, default to employee
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');

  -- Insert profile
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (id) DO NOTHING;

  -- Insert employee record if role is employee
  IF v_role = 'employee' THEN
    INSERT INTO public.employees (
      auth_user_id,
      full_name,
      email,
      phone,
      department,
      designation,
      joining_date,
      leave_allocation,
      status
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Employee'),
      NEW.email,
      NEW.raw_user_meta_data->>'phone',
      COALESCE(NEW.raw_user_meta_data->>'department', 'Other'),
      COALESCE(NEW.raw_user_meta_data->>'designation', 'Staff'),
      COALESCE((NEW.raw_user_meta_data->>'joining_date')::DATE, NOW()::DATE),
      COALESCE((NEW.raw_user_meta_data->>'leave_allocation')::INTEGER, 12),
      'active'
    )
    ON CONFLICT (email) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RPC: APPROVE LEAVE REQUEST
CREATE OR REPLACE FUNCTION approve_leave_request(
  p_request_id  UUID,
  p_hr_user_id  UUID
)
RETURNS VOID AS $$
DECLARE
  v_employee_auth_id UUID;
  v_start_date DATE;
  v_end_date DATE;
  v_leave_type TEXT;
BEGIN
  UPDATE public.leave_requests
  SET
    status      = 'Approved',
    approved_by = p_hr_user_id,
    approved_at = NOW(),
    updated_at  = NOW()
  WHERE id = p_request_id
  RETURNING
    (SELECT auth_user_id FROM public.employees WHERE id = leave_requests.employee_id),
    start_date, end_date, leave_type
  INTO v_employee_auth_id, v_start_date, v_end_date, v_leave_type;

  INSERT INTO public.notifications (user_id, title, message, type, related_id)
  VALUES (
    v_employee_auth_id,
    'Leave Request Approved',
    'Your ' || v_leave_type || ' request from ' || v_start_date || ' to ' || v_end_date || ' has been approved.',
    'leave',
    p_request_id
  );

  INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
  VALUES (
    'APPROVED',
    'leave_request',
    p_request_id,
    p_hr_user_id,
    jsonb_build_object('status', 'Approved', 'approved_at', NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: REJECT LEAVE REQUEST
CREATE OR REPLACE FUNCTION reject_leave_request(
  p_request_id      UUID,
  p_hr_user_id      UUID,
  p_rejection_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_employee_auth_id UUID;
  v_leave_type TEXT;
BEGIN
  UPDATE public.leave_requests
  SET
    status           = 'Rejected',
    rejection_reason = p_rejection_reason,
    approved_by      = p_hr_user_id,
    approved_at      = NOW(),
    updated_at       = NOW()
  WHERE id = p_request_id
  RETURNING
    (SELECT auth_user_id FROM public.employees WHERE id = leave_requests.employee_id),
    leave_type
  INTO v_employee_auth_id, v_leave_type;

  INSERT INTO public.notifications (user_id, title, message, type, related_id)
  VALUES (
    v_employee_auth_id,
    'Leave Request Rejected',
    'Your ' || v_leave_type || ' request has been rejected. Reason: ' || p_rejection_reason,
    'leave',
    p_request_id
  );

  INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
  VALUES (
    'REJECTED',
    'leave_request',
    p_request_id,
    p_hr_user_id,
    jsonb_build_object('status', 'Rejected', 'rejection_reason', p_rejection_reason)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: APPROVE PERMISSION REQUEST
CREATE OR REPLACE FUNCTION approve_permission_request(
  p_request_id  UUID,
  p_hr_user_id  UUID
)
RETURNS VOID AS $$
DECLARE
  v_employee_auth_id UUID;
  v_perm_date DATE;
  v_start_time TIME;
  v_end_time TIME;
BEGIN
  UPDATE public.permission_requests
  SET
    status      = 'Approved',
    approved_by = p_hr_user_id,
    approved_at = NOW(),
    updated_at  = NOW()
  WHERE id = p_request_id
  RETURNING
    (SELECT auth_user_id FROM public.employees WHERE id = permission_requests.employee_id),
    permission_date, start_time, end_time
  INTO v_employee_auth_id, v_perm_date, v_start_time, v_end_time;

  INSERT INTO public.notifications (user_id, title, message, type, related_id)
  VALUES (
    v_employee_auth_id,
    'Permission Request Approved',
    'Your permission request for ' || v_perm_date || ' (' || v_start_time || ' - ' || v_end_time || ') has been approved.',
    'permission',
    p_request_id
  );

  INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
  VALUES (
    'APPROVED',
    'permission_request',
    p_request_id,
    p_hr_user_id,
    jsonb_build_object('status', 'Approved')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: REJECT PERMISSION REQUEST
CREATE OR REPLACE FUNCTION reject_permission_request(
  p_request_id       UUID,
  p_hr_user_id       UUID,
  p_rejection_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_employee_auth_id UUID;
BEGIN
  UPDATE public.permission_requests
  SET
    status           = 'Rejected',
    rejection_reason = p_rejection_reason,
    approved_by      = p_hr_user_id,
    approved_at      = NOW(),
    updated_at       = NOW()
  WHERE id = p_request_id
  RETURNING
    (SELECT auth_user_id FROM public.employees WHERE id = permission_requests.employee_id)
  INTO v_employee_auth_id;

  INSERT INTO public.notifications (user_id, title, message, type, related_id)
  VALUES (
    v_employee_auth_id,
    'Permission Request Rejected',
    'Your permission request has been rejected. Reason: ' || p_rejection_reason,
    'permission',
    p_request_id
  );

  INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
  VALUES (
    'REJECTED',
    'permission_request',
    p_request_id,
    p_hr_user_id,
    jsonb_build_object('status', 'Rejected', 'rejection_reason', p_rejection_reason)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: GET EMPLOYEE LEAVE SUMMARY
CREATE OR REPLACE FUNCTION get_employee_leave_summary(p_employee_id UUID)
RETURNS TABLE (
  allocation    INTEGER,
  used          BIGINT,
  remaining     BIGINT,
  pending       BIGINT,
  rejected      BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.leave_allocation AS allocation,
    COALESCE(SUM(CASE WHEN lr.status = 'Approved' THEN lr.total_days ELSE 0 END), 0) AS used,
    (e.leave_allocation - COALESCE(SUM(CASE WHEN lr.status = 'Approved' THEN lr.total_days ELSE 0 END), 0)) AS remaining,
    COALESCE(COUNT(CASE WHEN lr.status = 'Pending' THEN 1 END), 0) AS pending,
    COALESCE(COUNT(CASE WHEN lr.status = 'Rejected' THEN 1 END), 0) AS rejected
  FROM public.employees e
  LEFT JOIN public.leave_requests lr ON lr.employee_id = e.id
  WHERE e.id = p_employee_id
  GROUP BY e.id, e.leave_allocation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: GET EMPLOYEE PERMISSION SUMMARY
CREATE OR REPLACE FUNCTION get_employee_permission_summary(p_employee_id UUID)
RETURNS TABLE (
  total         BIGINT,
  approved      BIGINT,
  rejected      BIGINT,
  pending       BIGINT,
  approved_hours NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total,
    COUNT(CASE WHEN pr.status = 'Approved' THEN 1 END) AS approved,
    COUNT(CASE WHEN pr.status = 'Rejected' THEN 1 END) AS rejected,
    COUNT(CASE WHEN pr.status = 'Pending' THEN 1 END) AS pending,
    ROUND(COALESCE(SUM(CASE WHEN pr.status = 'Approved' THEN pr.duration_minutes ELSE 0 END) / 60.0, 0), 1) AS approved_hours
  FROM public.permission_requests pr
  WHERE pr.employee_id = p_employee_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS: PROFILES
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "HR can view all profiles" ON public.profiles;
CREATE POLICY "HR can view all profiles" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "HR can update all profiles" ON public.profiles;
CREATE POLICY "HR can update all profiles" ON public.profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- RLS: EMPLOYEES
DROP POLICY IF EXISTS "Employees can view own record" ON public.employees;
CREATE POLICY "Employees can view own record" ON public.employees FOR SELECT USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "HR can view all employees" ON public.employees;
CREATE POLICY "HR can view all employees" ON public.employees FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS "HR can insert employees" ON public.employees;
CREATE POLICY "HR can insert employees" ON public.employees FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS "HR can update employees" ON public.employees;
CREATE POLICY "HR can update employees" ON public.employees FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS "Employees can update own limited fields" ON public.employees;
CREATE POLICY "Employees can update own limited fields" ON public.employees FOR UPDATE USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());

-- RLS: LEAVE REQUESTS
DROP POLICY IF EXISTS "Employees can view own leave requests" ON public.leave_requests;
CREATE POLICY "Employees can view own leave requests" ON public.leave_requests FOR SELECT USING (
  employee_id IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "HR can view all leave requests" ON public.leave_requests;
CREATE POLICY "HR can view all leave requests" ON public.leave_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS "Employees can create leave requests" ON public.leave_requests;
CREATE POLICY "Employees can create leave requests" ON public.leave_requests FOR INSERT WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Employees can cancel own pending requests" ON public.leave_requests;
CREATE POLICY "Employees can cancel own pending requests" ON public.leave_requests FOR UPDATE USING (
  employee_id IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid()) AND status = 'Pending'
) WITH CHECK (status = 'Cancelled');

DROP POLICY IF EXISTS "HR can update all leave requests" ON public.leave_requests;
CREATE POLICY "HR can update all leave requests" ON public.leave_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- RLS: PERMISSION REQUESTS
DROP POLICY IF EXISTS "Employees can view own permission requests" ON public.permission_requests;
CREATE POLICY "Employees can view own permission requests" ON public.permission_requests FOR SELECT USING (
  employee_id IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "HR can view all permission requests" ON public.permission_requests;
CREATE POLICY "HR can view all permission requests" ON public.permission_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS "Employees can create permission requests" ON public.permission_requests;
CREATE POLICY "Employees can create permission requests" ON public.permission_requests FOR INSERT WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Employees can cancel own pending permissions" ON public.permission_requests;
CREATE POLICY "Employees can cancel own pending permissions" ON public.permission_requests FOR UPDATE USING (
  employee_id IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid()) AND status = 'Pending'
) WITH CHECK (status = 'Cancelled');

DROP POLICY IF EXISTS "HR can update all permission requests" ON public.permission_requests;
CREATE POLICY "HR can update all permission requests" ON public.permission_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

-- RLS: NOTIFICATIONS
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid() OR employee_phone IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid() OR employee_phone IS NOT NULL);

DROP POLICY IF EXISTS "HR can insert notifications" ON public.notifications;
CREATE POLICY "HR can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

-- RLS: PUSH SUBSCRIPTIONS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Allow all access to push subscriptions" ON public.push_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- TRIGGER: Push Notification via pg_net
-- (See supabase/migrations/20260809_push_trigger_pg_net.sql for the full version)
-- Ensure pg_net is enabled:
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  v_service_key TEXT;
  v_payload     JSONB;
  v_headers     JSONB;
  v_request_id  BIGINT;
  v_edge_fn_url CONSTANT TEXT := 'https://qabtydijzsvfejeyrakc.supabase.co/functions/v1/send-push';
BEGIN
  -- Fire for HR notifications (user_id IS NOT NULL) OR
  -- employee-targeted notifications (employee_phone IS NOT NULL AND title is NOT 'Leave Request Submitted' / 'Permission Request Submitted')
  IF NEW.user_id IS NULL AND (
    NEW.employee_phone IS NULL OR 
    NEW.title IN ('Leave Request Submitted', 'Permission Request Submitted', 'Comp-Off Request Submitted')
  ) THEN
    RETURN NEW;
  END IF;

  -- Read service_role key from Supabase-managed PostgreSQL setting.
  -- Never hardcoded. Safe to commit.
  v_service_key := current_setting('app.settings.service_role_key', true);

  v_payload := jsonb_build_object(
    'type',   'INSERT',
    'table',  'notifications',
    'record', jsonb_build_object(
      'id',             NEW.id,
      'user_id',        NEW.user_id,
      'employee_phone', NEW.employee_phone,
      'title',          NEW.title,
      'message',        NEW.message,
      'type',           NEW.type,
      'is_read',        NEW.is_read,
      'related_id',     NEW.related_id,
      'created_at',     NEW.created_at
    )
  );

  v_headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || coalesce(v_service_key, '')
  );

  -- CORRECT: net.http_post(), body as JSONB
  SELECT net.http_post(
    url     := v_edge_fn_url,
    headers := v_headers,
    body    := v_payload
  ) INTO v_request_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[PUSH TRIGGER] ERROR: notification_id=%, %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_notification_inserted ON public.notifications;
CREATE TRIGGER trg_on_notification_inserted
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push_notification();

-- RLS: AUDIT LOGS
DROP POLICY IF EXISTS "HR can view audit logs" ON public.audit_logs;
CREATE POLICY "HR can view audit logs" ON public.audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'hr'))
);

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- GRANT EXECUTE ON RPC FUNCTIONS
GRANT EXECUTE ON FUNCTION approve_leave_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_leave_request(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_permission_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_permission_request(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_employee_leave_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_employee_permission_summary(UUID) TO authenticated;
