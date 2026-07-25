CREATE OR REPLACE FUNCTION public.get_activity_metrics(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prev_from timestamptz;
  v_by_member jsonb;
  v_by_module jsonb;
  v_by_hour jsonb;
  v_previous_count bigint;
  v_total bigint;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'administrativo') OR
    public.has_role(auth.uid(), 'auditor') OR
    public.has_role(auth.uid(), 'ventas') OR
    public.has_role(auth.uid(), 'dispatcher') OR
    public.has_role(auth.uid(), 'mechanic')
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  v_prev_from := p_from - (p_to - p_from);

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb)
  INTO v_by_member
  FROM (
    SELECT
      actor_id            AS "actorId",
      COALESCE(MAX(actor_name), 'Sistema') AS "actorName",
      MAX(actor_role)     AS "actorRole",
      COUNT(*)::bigint    AS total,
      MAX(created_at)     AS "lastAt"
    FROM public.activity_feed
    WHERE created_at >= p_from AND created_at <= p_to
      AND (is_e2e IS NULL OR is_e2e = false)
    GROUP BY actor_id
  ) t;

  -- R15 AUTH-1: restaurar alias "entityType" (roto por rename accidental a "module").
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb)
  INTO v_by_module
  FROM (
    SELECT entity_type AS "entityType", COUNT(*)::bigint AS total
    FROM public.activity_feed
    WHERE created_at >= p_from AND created_at <= p_to
      AND (is_e2e IS NULL OR is_e2e = false)
    GROUP BY entity_type
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.hour), '[]'::jsonb)
  INTO v_by_hour
  FROM (
    SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::bigint AS total
    FROM public.activity_feed
    WHERE created_at >= p_from AND created_at <= p_to
      AND (is_e2e IS NULL OR is_e2e = false)
    GROUP BY 1
  ) t;

  SELECT COUNT(*) INTO v_total FROM public.activity_feed
  WHERE created_at >= p_from AND created_at <= p_to
    AND (is_e2e IS NULL OR is_e2e = false);

  SELECT COUNT(*) INTO v_previous_count FROM public.activity_feed
  WHERE created_at >= v_prev_from AND created_at < p_from
    AND (is_e2e IS NULL OR is_e2e = false);

  RETURN jsonb_build_object(
    'total', v_total,
    'previousCount', v_previous_count,
    'byMember', v_by_member,
    'byModule', v_by_module,
    'byHour', v_by_hour
  );
END;
$function$;