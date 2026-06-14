
CREATE OR REPLACE FUNCTION public.get_activity_metrics(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_span_ms bigint;
  v_prev_from timestamptz;
  v_by_member jsonb;
  v_by_module jsonb;
  v_by_hour jsonb;
  v_previous_count bigint;
BEGIN
  v_span_ms := EXTRACT(EPOCH FROM (p_to - p_from)) * 1000;
  v_prev_from := p_from - ((p_to - p_from));

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
    WHERE created_at >= p_from
      AND created_at <= p_to
      AND (is_e2e IS NULL OR is_e2e = false)
    GROUP BY actor_id
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entityType', entity_type, 'total', total) ORDER BY total DESC), '[]'::jsonb)
  INTO v_by_module
  FROM (
    SELECT entity_type, COUNT(*)::bigint AS total
    FROM public.activity_feed
    WHERE created_at >= p_from
      AND created_at <= p_to
      AND (is_e2e IS NULL OR is_e2e = false)
    GROUP BY entity_type
  ) m;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', hour, 'total', total) ORDER BY hour ASC), '[]'::jsonb)
  INTO v_by_hour
  FROM (
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'America/Monterrey'))::int AS hour,
      COUNT(*)::bigint AS total
    FROM public.activity_feed
    WHERE created_at >= p_from
      AND created_at <= p_to
      AND (is_e2e IS NULL OR is_e2e = false)
    GROUP BY 1
  ) h;

  SELECT COUNT(*)::bigint
  INTO v_previous_count
  FROM public.activity_feed
  WHERE created_at >= v_prev_from
    AND created_at < p_from
    AND (is_e2e IS NULL OR is_e2e = false);

  RETURN jsonb_build_object(
    'byMember', v_by_member,
    'byModule', v_by_module,
    'byHour', v_by_hour,
    'previousCount', v_previous_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_metrics(timestamptz, timestamptz) TO authenticated;
