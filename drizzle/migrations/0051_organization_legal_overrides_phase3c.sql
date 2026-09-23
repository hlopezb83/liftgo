-- =====================================================================
-- Ecosistema LiftGo · 0051: datos legales locales por organización.
--
-- El machote sigue siendo global y versionado. Cada empresa sólo puede
-- modificar los campos territoriales permitidos de su propia asignación.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.validate_legal_template_overrides()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_value jsonb;
  v_text text;
  v_limit integer;
BEGIN
  IF jsonb_typeof(NEW.local_overrides) <> 'object' THEN
    RAISE EXCEPTION 'Los datos legales locales deben ser un objeto'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(NEW.local_overrides)
  LOOP
    IF v_key <> ALL (ARRAY[
      'city', 'jurisdiction', 'legal_representative', 'witness_1', 'witness_2'
    ]::text[]) THEN
      RAISE EXCEPTION 'Override legal no permitido: %', v_key
        USING ERRCODE = 'check_violation';
    END IF;

    IF jsonb_typeof(v_value) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'El dato legal % debe ser texto', v_key
        USING ERRCODE = 'check_violation';
    END IF;

    IF jsonb_typeof(v_value) = 'string' THEN
      v_text := v_value #>> '{}';
      v_limit := CASE WHEN v_key = 'city' THEN 160 ELSE 240 END;
      IF length(v_text) > v_limit THEN
        RAISE EXCEPTION 'El dato legal % excede % caracteres', v_key, v_limit
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_legal_template_overrides()
  FROM PUBLIC, anon, authenticated;

-- Parametriza la jurisdicción del machote vigente como una nueva versión
-- append-only. No se modifica ninguna versión ya publicada.
DO $$
DECLARE
  v_definition record;
  v_content jsonb;
  v_new_content jsonb;
  v_new_version integer;
  v_new_version_id uuid;
BEGIN
  FOR v_definition IN
    SELECT d.id, d.current_version_id
    FROM public.legal_template_definitions d
    WHERE d.is_active
      AND d.document_type = 'rental_contract'
      AND d.current_version_id IS NOT NULL
  LOOP
    SELECT v.content INTO v_content
    FROM public.legal_template_versions v
    WHERE v.id = v_definition.current_version_id;

    IF v_content::text LIKE '%{jurisdiccion}%' THEN
      CONTINUE;
    END IF;

    SELECT jsonb_set(
      v_content,
      '{clauses}',
      coalesce(jsonb_agg(
        CASE
          WHEN clause ->> 'title' ILIKE '%jurisdicci%'
          THEN jsonb_set(
            clause,
            '{body}',
            to_jsonb('Las partes se someten a las leyes aplicables y a los tribunales competentes de {jurisdiccion}, renunciando a cualquier otro fuero.'::text)
          )
          ELSE clause
        END ORDER BY ordinality
      ), '[]'::jsonb)
    ) INTO v_new_content
    FROM jsonb_array_elements(coalesce(v_content -> 'clauses', '[]'::jsonb))
      WITH ORDINALITY AS item(clause, ordinality);

    IF v_new_content IS NOT DISTINCT FROM v_content THEN
      CONTINUE;
    END IF;

    SELECT coalesce(max(v.version), 0) + 1 INTO v_new_version
    FROM public.legal_template_versions v
    WHERE v.definition_id = v_definition.id;

    INSERT INTO public.legal_template_versions (
      definition_id, version, content, checksum_sha256, change_summary
    ) VALUES (
      v_definition.id,
      v_new_version,
      v_new_content,
      encode(digest(v_new_content::text, 'sha256'), 'hex'),
      'Parametriza la jurisdicción por organización'
    ) RETURNING id INTO v_new_version_id;

    UPDATE public.legal_template_definitions
    SET current_version_id = v_new_version_id, updated_at = now()
    WHERE id = v_definition.id;

    UPDATE public.organization_legal_template_assignments a
    SET version_id = v_new_version_id, updated_at = now()
    FROM public.organizations o
    WHERE a.definition_id = v_definition.id
      AND o.id = a.organization_id
      AND o.is_active
      AND a.is_active;
  END LOOP;
END;
$$;

-- Conserva para la empresa fuente los valores que ya estaban codificados en
-- su machote original. Las demás organizaciones quedan pendientes de capturar
-- sus datos reales y nunca heredan una ciudad ajena.
UPDATE public.organization_legal_template_assignments a
SET local_overrides = a.local_overrides
  || jsonb_build_object(
    'city', coalesce(nullif(a.local_overrides ->> 'city', ''), 'San Pedro Garza García, N.L.'),
    'jurisdiction', coalesce(nullif(a.local_overrides ->> 'jurisdiction', ''), 'Monterrey, Nuevo León')
  ),
  updated_at = now()
FROM public.legal_template_definitions d
WHERE d.id = a.definition_id
  AND d.source_organization_id = a.organization_id
  AND d.document_type = 'rental_contract';

CREATE OR REPLACE FUNCTION public.update_current_organization_legal_template_overrides(
  p_definition_id uuid,
  p_local_overrides jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_user uuid := (SELECT auth.uid());
  v_overrides jsonb;
BEGIN
  v_org := public.current_internal_organization_id();
  IF v_user IS NULL OR v_org IS NULL
     OR NOT public.is_internal_member(v_user) THEN
    RAISE EXCEPTION 'organization_context_required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    public.has_role(v_user, 'admin'::public.app_role)
    OR public.has_role(v_user, 'administrativo'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'legal_template_override_role_required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_local_overrides IS NULL OR jsonb_typeof(p_local_overrides) <> 'object' THEN
    RAISE EXCEPTION 'invalid_legal_template_overrides'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_local_overrides) AS key
    WHERE key <> ALL (ARRAY[
      'city', 'jurisdiction', 'legal_representative', 'witness_1', 'witness_2'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'unknown_legal_template_override'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_local_overrides) AS item(key, value)
    WHERE jsonb_typeof(value) NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION 'legal_template_override_must_be_text'
      USING ERRCODE = 'check_violation';
  END IF;

  v_overrides := jsonb_strip_nulls(jsonb_build_object(
    'city', nullif(btrim(p_local_overrides ->> 'city'), ''),
    'jurisdiction', nullif(btrim(p_local_overrides ->> 'jurisdiction'), ''),
    'legal_representative', nullif(btrim(p_local_overrides ->> 'legal_representative'), ''),
    'witness_1', nullif(btrim(p_local_overrides ->> 'witness_1'), ''),
    'witness_2', nullif(btrim(p_local_overrides ->> 'witness_2'), '')
  ));

  UPDATE public.organization_legal_template_assignments a
  SET local_overrides = v_overrides,
      assigned_by = v_user,
      updated_at = now()
  FROM public.legal_template_definitions d
  WHERE a.organization_id = v_org
    AND a.definition_id = p_definition_id
    AND a.is_active
    AND d.id = a.definition_id
    AND d.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'legal_template_assignment_missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_overrides;
END;
$$;

REVOKE ALL ON FUNCTION public.update_current_organization_legal_template_overrides(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_current_organization_legal_template_overrides(uuid, jsonb)
  TO authenticated;

-- La RPC anterior es el único canal cliente para estas mutaciones. Plataforma
-- conserva su canal service_role para asignar versiones.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.organization_legal_template_assignments
  FROM authenticated;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.organization_legal_template_assignments', 'UPDATE') THEN
    RAISE EXCEPTION 'POSTFLIGHT 0051: authenticated conserva UPDATE directo';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.update_current_organization_legal_template_overrides(uuid,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT 0051: authenticated no puede usar la RPC segura';
  END IF;
END
$$;

