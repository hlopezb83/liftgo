-- Identidad coherente del soporte: misma razón social que el selector de empresas.
-- Sólo cambia proyecciones y búsqueda. Conserva revisión, retención, sesión y permisos.
CREATE OR REPLACE FUNCTION public.support_case_projection(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id',c.id,'organizationId',c.organization_id,'organizationName',coalesce(nullif(btrim(cs.razon_social),''),o.name),
    'folio',c.folio,'revision',c.revision::text,'status',c.status,'severity',c.severity,
    'assigneeId',c.assignee_id,'assigneeName',p.full_name,'createdAt',c.created_at,'updatedAt',c.updated_at,
    'shared',c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp(),'sharedUntil',c.shared_until,
    'title',CASE WHEN c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() THEN c.title END,
    'description',CASE WHEN c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() THEN c.description END,
    'module',CASE WHEN c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() THEN c.module END,
    'appVersion',CASE WHEN c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() THEN c.app_version END,
    'requestId',CASE WHEN c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() THEN c.request_id END,
    'hasScreenshot',c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() AND c.screenshot_path IS NOT NULL)
  FROM public.platform_support_cases c JOIN public.organizations o ON o.id=c.organization_id
  LEFT JOIN public.company_settings cs ON cs.organization_id=c.organization_id
  LEFT JOIN public.profiles p ON p.user_id=c.assignee_id WHERE c.id=p_id
$$;
REVOKE ALL ON FUNCTION public.support_case_projection(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_list_support(p_actor uuid,p_session uuid,p_search text DEFAULT '',p_org uuid DEFAULT NULL,
  p_status text DEFAULT NULL,p_severity text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb; v_total bigint;
BEGIN
  PERFORM public.platform_support_assert(p_actor,p_session);
  IF p_search IS NULL OR length(p_search)>100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
    OR (p_status IS NOT NULL AND p_status NOT IN ('new','in_progress','waiting','resolved','closed'))
    OR (p_severity IS NOT NULL AND p_severity NOT IN ('critical','high','medium','low')) THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023'; END IF;
  WITH matches AS (
    SELECT c.id,c.updated_at FROM public.platform_support_cases c JOIN public.organizations o ON o.id=c.organization_id
    LEFT JOIN public.company_settings cs ON cs.organization_id=c.organization_id
    WHERE (p_org IS NULL OR c.organization_id=p_org) AND (p_status IS NULL OR c.status=p_status)
      AND (p_severity IS NULL OR c.severity=p_severity) AND (p_search='' OR strpos(lower(coalesce(nullif(btrim(cs.razon_social),''),o.name)||' '||o.name||' '||c.folio),lower(p_search))>0
        OR (c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() AND strpos(lower(coalesce(c.title,'')||' '||coalesce(c.module,'')),lower(p_search))>0))
  ), page AS (SELECT * FROM matches ORDER BY updated_at DESC,id LIMIT 25 OFFSET p_offset)
  SELECT (SELECT count(*) FROM matches),coalesce(jsonb_agg(public.support_case_projection(id)-'description' ORDER BY updated_at DESC,id),'[]')
    INTO v_total,v_rows FROM page;
  RETURN jsonb_build_object('rows',v_rows,'total',v_total,'observedAt',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.platform_list_support(uuid,uuid,text,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_support(uuid,uuid,text,uuid,text,text,integer) TO service_role;
