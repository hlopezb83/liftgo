-- Protección de ediciones globales: comprobar la base dentro de la misma transacción.
-- Mantiene los permisos y las versiones firmadas; no modifica filas existentes.

-- El trigger anterior asignaba now(), que es constante en una transacción y
-- sobrescribía el token del RPC. Toda edición del maestro debe avanzar la base.
CREATE OR REPLACE FUNCTION public.platform_catalog_edit_timestamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.platform_catalog_edit_timestamp() FROM PUBLIC,anon,authenticated;
DROP TRIGGER equipment_model_catalog_set_updated_at ON public.equipment_model_catalog;
CREATE TRIGGER equipment_model_catalog_set_updated_at BEFORE UPDATE ON public.equipment_model_catalog
  FOR EACH ROW EXECUTE FUNCTION public.platform_catalog_edit_timestamp();
DROP TRIGGER parts_catalog_set_updated_at ON public.parts_catalog;
CREATE TRIGGER parts_catalog_set_updated_at BEFORE UPDATE ON public.parts_catalog
  FOR EACH ROW EXECUTE FUNCTION public.platform_catalog_edit_timestamp();

CREATE OR REPLACE FUNCTION public.platform_update_equipment_model_catalog(
  p_actor uuid,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_manufacturer text,
  p_model text,
  p_capacity_kg numeric DEFAULT NULL,
  p_mast_height_m numeric DEFAULT NULL,
  p_fuel_type text DEFAULT NULL,
  p_specifications jsonb DEFAULT '{}'::jsonb,
  p_image_url text DEFAULT NULL,
  p_spec_sheet_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_updated_at timestamptz;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.write');
  SELECT updated_at INTO v_updated_at FROM public.equipment_model_catalog WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maestro global no encontrado' USING ERRCODE='P0002'; END IF;
  IF p_expected_updated_at IS NULL OR v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Los datos cambiaron. Revisa la versión actual antes de guardar; tu captura se conserva.' USING ERRCODE='40001';
  END IF;
  IF nullif(btrim(p_manufacturer), '') IS NULL OR nullif(btrim(p_model), '') IS NULL THEN
    RAISE EXCEPTION 'Fabricante y modelo son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF p_capacity_kg IS NOT NULL AND p_capacity_kg <= 0 THEN
    RAISE EXCEPTION 'La capacidad debe ser mayor que cero' USING ERRCODE = '23514';
  END IF;
  IF p_mast_height_m IS NOT NULL AND p_mast_height_m <= 0 THEN
    RAISE EXCEPTION 'La altura de mástil debe ser mayor que cero' USING ERRCODE = '23514';
  END IF;

  UPDATE public.equipment_model_catalog
  SET manufacturer = btrim(p_manufacturer), model = btrim(p_model),
      capacity_kg = p_capacity_kg, mast_height_m = p_mast_height_m,
      fuel_type = nullif(btrim(p_fuel_type), ''),
      specifications = coalesce(p_specifications, '{}'::jsonb),
      image_url = nullif(btrim(p_image_url), ''),
      spec_sheet_url = nullif(btrim(p_spec_sheet_url), ''),
      updated_by = p_actor, updated_at = greatest(clock_timestamp(),v_updated_at+interval '1 microsecond')
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modelo global no encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Mantiene las columnas de compatibilidad sincronizadas. Las tarifas,
  -- alias y habilitación local no aparecen en este UPDATE.
  UPDATE public.equipment_models m
  SET manufacturer = c.manufacturer,
      model = c.model,
      default_capacity_kg = c.capacity_kg,
      default_mast_height_m = c.mast_height_m,
      default_fuel_type = coalesce(c.fuel_type, 'Diesel'),
      updated_at = now()
  FROM public.equipment_model_catalog c
  WHERE c.id = p_id AND m.catalog_model_id = c.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_update_equipment_model_catalog(
  p_actor uuid,
  p_id uuid,
  p_manufacturer text,
  p_model text,
  p_capacity_kg numeric DEFAULT NULL,
  p_mast_height_m numeric DEFAULT NULL,
  p_fuel_type text DEFAULT NULL,
  p_specifications jsonb DEFAULT '{}'::jsonb,
  p_image_url text DEFAULT NULL,
  p_spec_sheet_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.write');
  RAISE EXCEPTION 'Los datos cambiaron. Actualiza esta vista antes de guardar; tu captura se conserva.' USING ERRCODE='40001';
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_update_parts_catalog(
  p_actor uuid,
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_sku text,
  p_name text,
  p_description text DEFAULT NULL,
  p_manufacturer text DEFAULT NULL,
  p_oem_numbers text[] DEFAULT '{}'::text[],
  p_category text DEFAULT NULL,
  p_unit_of_measure text DEFAULT 'pieza',
  p_image_url text DEFAULT NULL,
  p_equipment_model_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_missing integer;
  v_updated_at timestamptz;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.write');
  SELECT updated_at INTO v_updated_at FROM public.parts_catalog WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maestro global no encontrado' USING ERRCODE='P0002'; END IF;
  IF p_expected_updated_at IS NULL OR v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Los datos cambiaron. Revisa la versión actual antes de guardar; tu captura se conserva.' USING ERRCODE='40001';
  END IF;
  IF nullif(btrim(p_sku), '') IS NULL OR nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'SKU y nombre son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(p_unit_of_measure), '') IS NULL THEN
    RAISE EXCEPTION 'La unidad de medida es obligatoria' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_missing
  FROM unnest(coalesce(p_equipment_model_ids, '{}'::uuid[])) model_id
  WHERE NOT EXISTS (SELECT 1 FROM public.equipment_model_catalog m WHERE m.id = model_id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Uno o más modelos compatibles no existen' USING ERRCODE = '23503';
  END IF;

  UPDATE public.parts_catalog
  SET sku = upper(btrim(p_sku)), name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      manufacturer = nullif(btrim(p_manufacturer), ''),
      oem_numbers = coalesce(p_oem_numbers, '{}'::text[]),
      category = nullif(btrim(p_category), ''),
      unit_of_measure = btrim(p_unit_of_measure),
      image_url = nullif(btrim(p_image_url), ''),
      updated_by = p_actor, updated_at = greatest(clock_timestamp(),v_updated_at+interval '1 microsecond')
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU global no encontrado' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.parts_catalog_equipment_models WHERE part_catalog_id = p_id;
  INSERT INTO public.parts_catalog_equipment_models (
    part_catalog_id, equipment_model_catalog_id, created_by
  )
  SELECT p_id, model_id, p_actor
  FROM (SELECT DISTINCT unnest(coalesce(p_equipment_model_ids, '{}'::uuid[])) AS model_id) ids;
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_update_parts_catalog(
  p_actor uuid,
  p_id uuid,
  p_sku text,
  p_name text,
  p_description text DEFAULT NULL,
  p_manufacturer text DEFAULT NULL,
  p_oem_numbers text[] DEFAULT '{}'::text[],
  p_category text DEFAULT NULL,
  p_unit_of_measure text DEFAULT 'pieza',
  p_image_url text DEFAULT NULL,
  p_equipment_model_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'catalogs.write');
  RAISE EXCEPTION 'Los datos cambiaron. Actualiza esta vista antes de guardar; tu captura se conserva.' USING ERRCODE='40001';
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_publish_legal_template_version(
  p_actor uuid, p_definition_id uuid, p_expected_version_id uuid, p_content jsonb,
  p_change_summary text, p_assign_all_active boolean DEFAULT false
)
RETURNS TABLE (version_id uuid, version integer, checksum_sha256 text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_definition public.legal_template_definitions%ROWTYPE;
  v_version_id uuid;
  v_version integer;
  v_checksum text;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'templates.publish');
  IF btrim(coalesce(p_change_summary, '')) = '' OR length(p_change_summary) > 500 THEN
    RAISE EXCEPTION 'El resumen del cambio debe tener entre 1 y 500 caracteres'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  PERFORM public.validate_legal_template_content(p_content);

  SELECT * INTO v_definition
  FROM public.legal_template_definitions d
  WHERE d.id = p_definition_id AND d.is_active
  FOR UPDATE;
  IF v_definition.id IS NULL THEN
    RAISE EXCEPTION 'Plantilla legal activa no encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_definition.current_version_id IS DISTINCT FROM p_expected_version_id THEN
    RAISE EXCEPTION 'La versión cambió. Revisa la versión actual antes de publicar; tu captura se conserva.' USING ERRCODE='40001';
  END IF;

  SELECT coalesce(max(v.version), 0) + 1 INTO v_version
  FROM public.legal_template_versions v
  WHERE v.definition_id = p_definition_id;
  v_checksum := encode(extensions.digest(p_content::text, 'sha256'), 'hex');

  INSERT INTO public.legal_template_versions (
    definition_id, version, content, checksum_sha256, change_summary, created_by
  ) VALUES (
    p_definition_id, v_version, p_content, v_checksum, btrim(p_change_summary), p_actor
  ) RETURNING id INTO v_version_id;

  UPDATE public.legal_template_definitions
  SET current_version_id = v_version_id, updated_by = p_actor
  WHERE id = p_definition_id;

  IF p_assign_all_active THEN
    PERFORM public.assert_platform_capability(p_actor,'templates.assign');
    INSERT INTO public.organization_legal_template_assignments (
      organization_id, definition_id, version_id, local_overrides,
      is_active, assigned_by
    )
    SELECT o.id, p_definition_id, v_version_id, '{}'::jsonb, true, p_actor
    FROM public.organizations o
    WHERE o.is_active
    ON CONFLICT (organization_id, definition_id) DO UPDATE
      SET version_id = EXCLUDED.version_id,
          is_active = true,
          assigned_by = EXCLUDED.assigned_by;
  END IF;

  RETURN QUERY SELECT v_version_id, v_version, v_checksum;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_publish_legal_template_version(
  p_actor uuid, p_definition_id uuid, p_content jsonb,
  p_change_summary text, p_assign_all_active boolean DEFAULT false
)
RETURNS TABLE (version_id uuid, version integer, checksum_sha256 text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sólo se permite la primera publicación sin versión base (importación de una definición nueva).
  RETURN QUERY SELECT * FROM public.platform_publish_legal_template_version(p_actor,p_definition_id,NULL::uuid,p_content,p_change_summary,p_assign_all_active);
END;
$$;

DO $acl$
DECLARE v_function regprocedure;
BEGIN
  FOR v_function IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('platform_update_equipment_model_catalog','platform_update_parts_catalog','platform_publish_legal_template_version') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',v_function);
  END LOOP;
END $acl$;

CREATE OR REPLACE FUNCTION public.platform_list_legal_template_history(p_actor uuid,p_definition_id uuid)
RETURNS TABLE (id uuid,definition_id uuid,version integer,checksum_sha256 text,content jsonb,
  change_summary text,created_by uuid,created_at timestamptz,created_by_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'templates.read');
  IF NOT EXISTS(SELECT 1 FROM public.legal_template_definitions d WHERE d.id=p_definition_id) THEN
    RAISE EXCEPTION 'Plantilla legal no encontrada' USING ERRCODE='P0002';
  END IF;
  RETURN QUERY SELECT v.id,v.definition_id,v.version,v.checksum_sha256,v.content,
    v.change_summary,v.created_by,v.created_at,p.full_name
    FROM public.legal_template_versions v LEFT JOIN public.profiles p ON p.user_id=v.created_by
    WHERE v.definition_id=p_definition_id ORDER BY v.version DESC;
END $$;
REVOKE ALL ON FUNCTION public.platform_list_legal_template_history(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_legal_template_history(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_get_monitoring(p_actor uuid,p_session uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'monitoring.read');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('observedAt',clock_timestamp(),
    'pendingOnboarding',(SELECT count(*) FROM public.platform_onboarding_requests WHERE completed_at IS NULL),
    'incompleteBilling',(SELECT count(*) FROM public.organizations o LEFT JOIN public.company_settings cs ON cs.organization_id=o.id
      LEFT JOIN public.billing_secrets bs ON bs.organization_id=o.id WHERE o.is_active AND
      (cs.facturapi_mode IS NULL OR cs.facturapi_mode NOT IN ('test','live') OR
       nullif(btrim(cs.rfc),'') IS NULL OR nullif(btrim(cs.razon_social),'') IS NULL OR
       nullif(btrim(cs.regimen_fiscal),'') IS NULL OR nullif(btrim(cs.lugar_expedicion),'') IS NULL OR
       nullif(btrim(CASE cs.facturapi_mode WHEN 'test' THEN bs.facturapi_test_key WHEN 'live' THEN bs.facturapi_live_key END),'') IS NULL)),
    'queuedJobs',(SELECT count(*) FROM public.cfdi_retry_queue WHERE status IN ('pending','processing')),
    'exhaustedJobs',(SELECT count(*) FROM public.cfdi_retry_queue WHERE status='exhausted'),
    'openReports',(SELECT count(*) FROM public.feedback_reports WHERE status IN ('new','triage','accepted','in_progress')),
    'openSupportCases',CASE WHEN EXISTS(SELECT 1 FROM public.platform_operators po JOIN public.profiles p ON p.user_id=po.auth_user_id
      WHERE po.auth_user_id=p_actor AND p.is_active AND 'support.read'=ANY(public.platform_profile_capabilities(po.access_profile)))
      THEN (SELECT count(*) FROM public.platform_support_cases c WHERE c.status IN ('new','in_progress','waiting')) ELSE NULL END,
    'lastCheckAt',(SELECT max(completed_at) FROM public.platform_integration_checks));
END $$;

CREATE OR REPLACE FUNCTION public.platform_list_support(p_actor uuid,p_session uuid,p_search text DEFAULT '',p_org uuid DEFAULT NULL,
  p_status text DEFAULT NULL,p_severity text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb; v_total bigint;
BEGIN
  PERFORM public.platform_support_assert(p_actor,p_session);
  IF p_search IS NULL OR length(p_search)>100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
    OR (p_status IS NOT NULL AND p_status NOT IN ('new','in_progress','waiting','resolved','closed','open'))
    OR (p_severity IS NOT NULL AND p_severity NOT IN ('critical','high','medium','low')) THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023'; END IF;
  WITH matches AS (
    SELECT c.id,c.updated_at FROM public.platform_support_cases c JOIN public.organizations o ON o.id=c.organization_id
    LEFT JOIN public.company_settings cs ON cs.organization_id=c.organization_id
    WHERE (p_org IS NULL OR c.organization_id=p_org) AND (p_status IS NULL OR c.status=p_status OR (p_status='open' AND c.status IN ('new','in_progress','waiting')))
      AND (p_severity IS NULL OR c.severity=p_severity) AND (p_search='' OR strpos(lower(coalesce(nullif(btrim(cs.razon_social),''),o.name)||' '||o.name||' '||c.folio),lower(p_search))>0
        OR (c.withdrawn_at IS NULL AND c.shared_until>statement_timestamp() AND strpos(lower(coalesce(c.title,'')||' '||coalesce(c.module,'')),lower(p_search))>0))
  ), page AS (SELECT * FROM matches ORDER BY updated_at DESC,id LIMIT 25 OFFSET p_offset)
  SELECT (SELECT count(*) FROM matches),coalesce(jsonb_agg(public.support_case_projection(id)-'description' ORDER BY updated_at DESC,id),'[]')
    INTO v_total,v_rows FROM page;
  RETURN jsonb_build_object('rows',v_rows,'total',v_total,'observedAt',clock_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.platform_list_fiscal_jobs(p_actor uuid,p_session uuid,p_search text DEFAULT '',
  p_org uuid DEFAULT NULL,p_status text DEFAULT NULL,p_operation text DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_platform_capability(p_actor,'integrations.read');
  IF NOT public.platform_session_exists(p_actor,p_session) THEN RAISE EXCEPTION 'Sesión inválida' USING ERRCODE='42501'; END IF;
  IF p_search IS NULL OR length(p_search)>100 OR p_offset IS NULL OR p_offset<0 OR p_offset>100000
    OR (p_status IS NOT NULL AND p_status NOT IN ('pending','processing','succeeded','exhausted','removed','queued'))
    OR (p_operation IS NOT NULL AND p_operation NOT IN ('stamp','cancel','cancel_nc','cancel_rep')) THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023'; END IF;
  WITH jobs AS (
    SELECT j.id,j.observed_at,public.platform_fiscal_job_projection(j.id) AS row FROM public.platform_fiscal_jobs j
    WHERE (p_org IS NULL OR j.organization_id=p_org) AND (p_operation IS NULL OR j.operation=p_operation)
      AND (p_status IS NULL OR (p_status='removed' AND j.removed) OR (NOT j.removed AND (j.state->>'status'=p_status OR (p_status='queued' AND j.state->>'status' IN ('pending','processing')))))
  ), filtered AS (SELECT * FROM jobs WHERE btrim(p_search)='' OR position(lower(btrim(p_search)) IN
    lower(concat_ws(' ',row->>'organizationName',row->>'folio',row->>'documentId',id::text,
      (SELECT name FROM public.organizations WHERE id=(row->>'organizationId')::uuid))))>0),
  page AS (SELECT * FROM filtered ORDER BY observed_at DESC,id DESC LIMIT 25 OFFSET p_offset)
  SELECT jsonb_build_object('observedAt',clock_timestamp(),'total',(SELECT count(*) FROM filtered),
    'rows',coalesce(jsonb_agg(row ORDER BY observed_at DESC,id DESC),'[]'::jsonb)) INTO v_result FROM page;
  RETURN v_result;
END $$;
