
-- ============================================================
-- FEEDBACK MODULE
-- ============================================================

-- Sequence + RPC for FB-XXXX numbering
CREATE SEQUENCE IF NOT EXISTS public.feedback_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.generate_feedback_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num bigint;
BEGIN
  next_num := nextval('public.feedback_number_seq');
  RETURN 'FB-' || LPAD(next_num::text, 4, '0');
END;
$$;

-- Main table: feedback_reports
CREATE TABLE public.feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL UNIQUE DEFAULT public.generate_feedback_number(),
  reporter_id uuid NOT NULL,
  reporter_type text NOT NULL CHECK (reporter_type IN ('internal', 'customer')),
  reporter_name text,
  type text NOT NULL CHECK (type IN ('bug', 'improvement')),
  module text NOT NULL,
  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title text NOT NULL,
  description text NOT NULL,
  screenshot_url text,
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triage', 'accepted', 'in_progress', 'resolved', 'closed', 'rejected', 'duplicate')),
  points_awarded integer NOT NULL DEFAULT 0,
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_reporter ON public.feedback_reports(reporter_id);
CREATE INDEX idx_feedback_status ON public.feedback_reports(status);
CREATE INDEX idx_feedback_module ON public.feedback_reports(module);
CREATE INDEX idx_feedback_created ON public.feedback_reports(created_at DESC);

-- Status history
CREATE TABLE public.feedback_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.feedback_reports(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  comment text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_history_report ON public.feedback_status_history(report_id);

-- updated_at trigger
CREATE TRIGGER update_feedback_reports_updated_at
BEFORE UPDATE ON public.feedback_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_status_history ENABLE ROW LEVEL SECURITY;

-- Policies: feedback_reports
CREATE POLICY "Users insert own feedback"
  ON public.feedback_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Users read own feedback"
  ON public.feedback_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY "Admins full access feedback_reports"
  ON public.feedback_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access feedback_reports"
  ON public.feedback_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Auditor read feedback_reports"
  ON public.feedback_reports FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role));

-- Policies: feedback_status_history
CREATE POLICY "Admins full access feedback_history"
  ON public.feedback_status_history FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access feedback_history"
  ON public.feedback_status_history FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Users read own feedback history"
  ON public.feedback_status_history FOR SELECT TO authenticated
  USING (report_id IN (SELECT id FROM public.feedback_reports WHERE reporter_id = auth.uid()));

-- ============================================================
-- RPC: change feedback status + assign points atomically
-- ============================================================
CREATE OR REPLACE FUNCTION public.change_feedback_status(
  _report_id uuid,
  _new_status text,
  _comment text DEFAULT NULL
)
RETURNS public.feedback_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.feedback_reports;
  v_points integer := 0;
  v_severity_mult numeric := 1;
BEGIN
  -- Authorization: only admin/administrativo can change status
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_report FROM public.feedback_reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reporte no encontrado';
  END IF;

  IF v_report.status = _new_status THEN
    RETURN v_report;
  END IF;

  -- Severity multiplier (only applies to bugs)
  IF v_report.type = 'bug' THEN
    v_severity_mult := CASE v_report.severity
      WHEN 'critical' THEN 2
      WHEN 'high' THEN 1.5
      ELSE 1
    END;
  END IF;

  -- Points awarded on transition (cumulative; resets if rejected)
  IF _new_status = 'accepted' AND v_report.points_awarded < 5 THEN
    v_points := CASE WHEN v_report.type = 'bug' THEN 5 ELSE 3 END;
  ELSIF _new_status = 'resolved' THEN
    v_points := CASE
      WHEN v_report.type = 'bug' THEN ROUND(15 * v_severity_mult)::integer
      ELSE 10
    END;
  ELSIF _new_status IN ('rejected', 'duplicate') THEN
    v_points := 0;
  ELSE
    v_points := v_report.points_awarded;
  END IF;

  UPDATE public.feedback_reports
  SET status = _new_status,
      points_awarded = GREATEST(v_points, CASE WHEN _new_status IN ('rejected','duplicate') THEN 0 ELSE points_awarded END),
      resolved_at = CASE WHEN _new_status = 'resolved' THEN now() ELSE resolved_at END,
      updated_at = now()
  WHERE id = _report_id
  RETURNING * INTO v_report;

  INSERT INTO public.feedback_status_history (report_id, from_status, to_status, changed_by, comment)
  VALUES (_report_id, v_report.status, _new_status, auth.uid(), _comment);

  RETURN v_report;
END;
$$;

-- ============================================================
-- RPC: leaderboard (no PII exposure)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_feedback_leaderboard(
  _period text DEFAULT 'all'
)
RETURNS TABLE(
  reporter_id uuid,
  reporter_name text,
  total_reports bigint,
  accepted_reports bigint,
  resolved_reports bigint,
  total_points bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
BEGIN
  v_start := CASE _period
    WHEN 'month' THEN date_trunc('month', now())
    WHEN 'year' THEN date_trunc('year', now())
    ELSE '1970-01-01'::timestamptz
  END;

  RETURN QUERY
  SELECT
    fr.reporter_id,
    COALESCE(MAX(fr.reporter_name), 'Anónimo') AS reporter_name,
    COUNT(*)::bigint AS total_reports,
    COUNT(*) FILTER (WHERE fr.status IN ('accepted','in_progress','resolved','closed'))::bigint AS accepted_reports,
    COUNT(*) FILTER (WHERE fr.status IN ('resolved','closed'))::bigint AS resolved_reports,
    COALESCE(SUM(fr.points_awarded), 0)::bigint AS total_points
  FROM public.feedback_reports fr
  WHERE fr.created_at >= v_start
  GROUP BY fr.reporter_id
  HAVING COALESCE(SUM(fr.points_awarded), 0) > 0
  ORDER BY total_points DESC, resolved_reports DESC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feedback_leaderboard(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_feedback_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_feedback_number() TO authenticated;

-- ============================================================
-- Storage: feedback-screenshots bucket (private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-screenshots', 'feedback-screenshots', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own feedback screenshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own feedback screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'feedback-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins read all feedback screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'feedback-screenshots'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
  );

-- ============================================================
-- Add module to role_permissions for "Feedback"
-- ============================================================
INSERT INTO public.role_permissions (role, module, access_level)
SELECT r.role::app_role, 'Feedback', CASE WHEN r.role IN ('admin','administrativo') THEN 'full' ELSE 'read' END
FROM (VALUES ('admin'),('administrativo'),('auditor'),('ventas'),('dispatcher'),('mechanic'),('customer')) AS r(role)
ON CONFLICT (role, module) DO NOTHING;
