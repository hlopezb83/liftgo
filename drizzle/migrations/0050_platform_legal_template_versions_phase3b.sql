-- =====================================================================
-- Ecosistema LiftGo · 0050: publicación y adopción legal desde plataforma.
--
-- Sólo service_role puede ejecutar estas RPC y cada una vuelve a comprobar
-- que el actor sea operador de plataforma. Las versiones publicadas son
-- append-only; adoptar una versión no modifica contratos ya firmados.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.prevent_legal_template_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Las versiones legales publicadas son inmutables'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_legal_template_version_mutation
  ON public.legal_template_versions;
CREATE TRIGGER trg_prevent_legal_template_version_mutation
  BEFORE UPDATE OR DELETE ON public.legal_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_legal_template_version_mutation();

REVOKE ALL ON FUNCTION public.prevent_legal_template_version_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_legal_template_content(p_content jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_unknown text[];
BEGIN
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' THEN
    RAISE EXCEPTION 'El contenido legal debe ser un objeto'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT array_agg(key ORDER BY key) INTO v_unknown
  FROM jsonb_object_keys(p_content) AS key
  WHERE key <> ALL (ARRAY[
    'body_text', 'intro_text', 'declarations_landlord',
    'declarations_tenant', 'clauses', 'checklist_sections', 'pagare_text'
  ]::text[]);
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Campos legales no permitidos: %', array_to_string(v_unknown, ', ')
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_content ? 'body_text'
     AND jsonb_typeof(p_content -> 'body_text') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'body_text debe ser texto' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_content ? 'intro_text'
     AND jsonb_typeof(p_content -> 'intro_text') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'intro_text debe ser texto' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_content ? 'pagare_text'
     AND jsonb_typeof(p_content -> 'pagare_text') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'pagare_text debe ser texto' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF jsonb_typeof(coalesce(p_content -> 'declarations_landlord', '[]'::jsonb)) <> 'array'
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(p_content -> 'declarations_landlord', '[]'::jsonb)) value
       WHERE jsonb_typeof(value) <> 'string' OR btrim(value #>> '{}') = ''
     ) THEN
    RAISE EXCEPTION 'Las declaraciones del arrendador deben ser textos no vacíos'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_typeof(coalesce(p_content -> 'declarations_tenant', '[]'::jsonb)) <> 'array'
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(p_content -> 'declarations_tenant', '[]'::jsonb)) value
       WHERE jsonb_typeof(value) <> 'string' OR btrim(value #>> '{}') = ''
     ) THEN
    RAISE EXCEPTION 'Las declaraciones del arrendatario deben ser textos no vacíos'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF jsonb_typeof(coalesce(p_content -> 'clauses', '[]'::jsonb)) <> 'array'
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(p_content -> 'clauses', '[]'::jsonb)) clause
       WHERE jsonb_typeof(clause) <> 'object'
          OR btrim(coalesce(clause ->> 'title', '')) = ''
          OR btrim(coalesce(clause ->> 'body', '')) = ''
     ) THEN
    RAISE EXCEPTION 'Cada cláusula debe tener título y contenido'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF jsonb_typeof(coalesce(p_content -> 'checklist_sections', '[]'::jsonb)) <> 'array'
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(coalesce(p_content -> 'checklist_sections', '[]'::jsonb)) section
       WHERE jsonb_typeof(section) <> 'object'
          OR btrim(coalesce(section ->> 'title', '')) = ''
          OR jsonb_typeof(coalesce(section -> 'items', 'null'::jsonb)) <> 'array'
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(coalesce(section -> 'items', '[]'::jsonb)) item
            WHERE jsonb_typeof(item) <> 'string' OR btrim(item #>> '{}') = ''
          )
     ) THEN
    RAISE EXCEPTION 'Cada sección del checklist debe tener título y textos válidos'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF btrim(coalesce(p_content ->> 'body_text', '')) = ''
     AND btrim(coalesce(p_content ->> 'intro_text', '')) = ''
     AND jsonb_array_length(coalesce(p_content -> 'clauses', '[]'::jsonb)) = 0
     AND btrim(coalesce(p_content ->> 'pagare_text', '')) = '' THEN
    RAISE EXCEPTION 'La plantilla legal no puede quedar vacía'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_legal_template_content(jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_list_legal_templates(p_actor uuid)
RETURNS TABLE (
  id uuid, template_key text, document_type text, name text, description text,
  is_active boolean, current_version_id uuid, current_version integer,
  checksum_sha256 text, content jsonb, change_summary text,
  version_count bigint, assignment_count bigint, active_organization_count bigint,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  RETURN QUERY
  SELECT d.id, d.template_key, d.document_type, d.name, d.description,
         d.is_active, v.id, v.version, v.checksum_sha256, v.content,
         v.change_summary,
         (SELECT count(*) FROM public.legal_template_versions history
           WHERE history.definition_id = d.id),
         (SELECT count(*) FROM public.organization_legal_template_assignments a
           WHERE a.definition_id = d.id AND a.is_active),
         (SELECT count(*) FROM public.organizations o WHERE o.is_active),
         d.updated_at
  FROM public.legal_template_definitions d
  LEFT JOIN public.legal_template_versions v ON v.id = d.current_version_id
  ORDER BY d.document_type, d.name, d.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_legal_template_versions(
  p_actor uuid, p_definition_id uuid
)
RETURNS TABLE (
  id uuid, definition_id uuid, version integer, checksum_sha256 text,
  content jsonb, change_summary text, created_by uuid, created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.legal_template_definitions d WHERE d.id = p_definition_id) THEN
    RAISE EXCEPTION 'Plantilla legal no encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN QUERY
  SELECT v.id, v.definition_id, v.version, v.checksum_sha256, v.content,
         v.change_summary, v.created_by, v.created_at
  FROM public.legal_template_versions v
  WHERE v.definition_id = p_definition_id
  ORDER BY v.version DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_list_legal_template_assignments(
  p_actor uuid, p_definition_id uuid
)
RETURNS TABLE (
  organization_id uuid, organization_name text, organization_slug text,
  organization_is_active boolean, version_id uuid, version integer,
  checksum_sha256 text, local_overrides jsonb, assignment_is_active boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.legal_template_definitions d WHERE d.id = p_definition_id) THEN
    RAISE EXCEPTION 'Plantilla legal no encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.is_active, a.version_id, v.version,
         v.checksum_sha256, coalesce(a.local_overrides, '{}'::jsonb),
         coalesce(a.is_active, false), a.updated_at
  FROM public.organizations o
  LEFT JOIN public.organization_legal_template_assignments a
    ON a.organization_id = o.id AND a.definition_id = p_definition_id
  LEFT JOIN public.legal_template_versions v ON v.id = a.version_id
  ORDER BY o.is_active DESC, o.name, o.id;
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
DECLARE
  v_definition public.legal_template_definitions%ROWTYPE;
  v_version_id uuid;
  v_version integer;
  v_checksum text;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
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

CREATE OR REPLACE FUNCTION public.platform_assign_legal_template_version(
  p_actor uuid, p_organization_id uuid, p_definition_id uuid, p_version_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.is_active
  ) THEN
    RAISE EXCEPTION 'Organización activa no encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.legal_template_versions v
    JOIN public.legal_template_definitions d ON d.id = v.definition_id
    WHERE v.id = p_version_id AND v.definition_id = p_definition_id AND d.is_active
  ) THEN
    RAISE EXCEPTION 'Versión legal no encontrada para la plantilla'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.organization_legal_template_assignments (
    organization_id, definition_id, version_id, local_overrides,
    is_active, assigned_by
  ) VALUES (
    p_organization_id, p_definition_id, p_version_id, '{}'::jsonb, true, p_actor
  )
  ON CONFLICT (organization_id, definition_id) DO UPDATE
    SET version_id = EXCLUDED.version_id,
        is_active = true,
        assigned_by = EXCLUDED.assigned_by;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_legal_templates(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_list_legal_template_versions(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_list_legal_template_assignments(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_publish_legal_template_version(uuid, uuid, jsonb, text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_assign_legal_template_version(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.platform_list_legal_templates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_list_legal_template_versions(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_list_legal_template_assignments(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_publish_legal_template_version(uuid, uuid, jsonb, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_assign_legal_template_version(uuid, uuid, uuid, uuid) TO service_role;

DO $verify$
BEGIN
  IF has_function_privilege('authenticated',
       'public.platform_publish_legal_template_version(uuid,uuid,jsonb,text,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.platform_publish_legal_template_version(uuid,uuid,jsonb,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTFLIGHT 0050: permisos inválidos en publicación legal';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.legal_template_versions'::regclass
      AND tgname = 'trg_prevent_legal_template_version_mutation'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT 0050: falta guarda append-only';
  END IF;
END;
$verify$;
