CREATE OR REPLACE FUNCTION public.get_feedback_leaderboard(_period text DEFAULT 'all'::text)
RETURNS TABLE(reporter_id uuid, reporter_name text, total_reports bigint, accepted_reports bigint, resolved_reports bigint, total_points bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_is_customer boolean;
BEGIN
  v_start := CASE _period
    WHEN 'month' THEN date_trunc('month', now())
    WHEN 'year' THEN date_trunc('year', now())
    ELSE '1970-01-01'::timestamptz
  END;

  v_is_customer := has_role(auth.uid(), 'customer'::app_role);

  RETURN QUERY
  SELECT
    CASE WHEN v_is_customer THEN NULL::uuid ELSE fr.reporter_id END AS reporter_id,
    CASE
      WHEN v_is_customer AND fr.reporter_type <> 'customer' THEN 'Equipo LiftGo'
      ELSE COALESCE(MAX(fr.reporter_name), 'Anónimo')
    END AS reporter_name,
    COUNT(*)::bigint AS total_reports,
    COUNT(*) FILTER (WHERE fr.status IN ('accepted','in_progress','resolved','closed'))::bigint AS accepted_reports,
    COUNT(*) FILTER (WHERE fr.status IN ('resolved','closed'))::bigint AS resolved_reports,
    COALESCE(SUM(fr.points_awarded), 0)::bigint AS total_points
  FROM public.feedback_reports fr
  WHERE fr.created_at >= v_start
  GROUP BY fr.reporter_id, (CASE WHEN v_is_customer AND fr.reporter_type <> 'customer' THEN 'staff' ELSE 'self' END)
  HAVING COALESCE(SUM(fr.points_awarded), 0) > 0
  ORDER BY total_points DESC, resolved_reports DESC
  LIMIT 50;
END;
$function$;