-- =====================================================================
-- Ecosistema LiftGo · 0049: plantillas legales versionadas en runtime.
--
-- La identidad legal es global y append-only. Cada organización adopta una
-- versión explícita; los contratos firmados congelan esa versión exacta.
-- =====================================================================

ALTER TABLE public.contracts
  ADD COLUMN legal_template_version_id uuid
  REFERENCES public.legal_template_versions(id) ON DELETE RESTRICT;

CREATE INDEX contracts_legal_template_version_idx
  ON public.contracts (legal_template_version_id)
  WHERE legal_template_version_id IS NOT NULL;

COMMENT ON COLUMN public.contracts.legal_template_version_id IS
  'Versión legal global adoptada por la organización al firmar el contrato.';

ALTER TABLE public.organization_legal_template_assignments
  ADD CONSTRAINT organization_legal_template_overrides_object_check
  CHECK (jsonb_typeof(local_overrides) = 'object');

CREATE OR REPLACE FUNCTION public.validate_legal_template_overrides()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_unknown text[];
BEGIN
  SELECT array_agg(key ORDER BY key)
    INTO v_unknown
  FROM jsonb_object_keys(NEW.local_overrides) AS key
  WHERE key <> ALL (ARRAY[
    'city', 'jurisdiction', 'legal_representative', 'witness_1', 'witness_2'
  ]::text[]);

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Overrides legales no permitidos: %', array_to_string(v_unknown, ', ')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_legal_template_overrides
  ON public.organization_legal_template_assignments;
CREATE TRIGGER trg_validate_legal_template_overrides
  BEFORE INSERT OR UPDATE OF local_overrides
  ON public.organization_legal_template_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_legal_template_overrides();

REVOKE ALL ON FUNCTION public.validate_legal_template_overrides()
  FROM PUBLIC, anon, authenticated;

-- Las organizaciones activas adoptan la versión vigente importada desde Org 1.
-- No se duplica contenido y no se inventan cláusulas.
INSERT INTO public.organization_legal_template_assignments (
  organization_id, definition_id, version_id, local_overrides, is_active
)
SELECT o.id, d.id, d.current_version_id, '{}'::jsonb, true
FROM public.organizations o
CROSS JOIN public.legal_template_definitions d
WHERE o.is_active
  AND d.is_active
  AND d.current_version_id IS NOT NULL
ON CONFLICT (organization_id, definition_id) DO NOTHING;

-- Fuente única para borradores y pantallas internas. La organización se
-- deriva de la sesión verificada; el navegador nunca envía organization_id.
CREATE OR REPLACE FUNCTION public.get_effective_legal_template(
  p_document_type text DEFAULT 'rental_contract'
)
RETURNS TABLE (
  definition_id uuid,
  template_key text,
  template_name text,
  document_type text,
  version_id uuid,
  version integer,
  checksum_sha256 text,
  content jsonb,
  local_overrides jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_count integer;
BEGIN
  v_org := public.current_internal_organization_id();
  IF v_org IS NULL OR NOT public.is_internal_member((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'organization_context_required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.organization_legal_template_assignments a
  JOIN public.legal_template_definitions d ON d.id = a.definition_id
  JOIN public.legal_template_versions v ON v.id = a.version_id
  WHERE a.organization_id = v_org
    AND a.is_active
    AND d.is_active
    AND d.document_type = p_document_type;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'legal_template_assignment_missing:%', p_document_type
      USING ERRCODE = 'check_violation';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'legal_template_assignment_ambiguous:%', p_document_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  SELECT d.id, d.template_key, d.name, d.document_type,
         v.id, v.version, v.checksum_sha256, v.content, a.local_overrides
  FROM public.organization_legal_template_assignments a
  JOIN public.legal_template_definitions d ON d.id = a.definition_id
  JOIN public.legal_template_versions v ON v.id = a.version_id
  WHERE a.organization_id = v_org
    AND a.is_active
    AND d.is_active
    AND d.document_type = p_document_type;
END;
$$;

REVOKE ALL ON FUNCTION public.get_effective_legal_template(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_legal_template(text)
  TO authenticated;

-- Congela la plantilla asignada a la organización del contrato. La versión
-- anterior elegía una plantilla local con LIMIT 1 global, sin organization_id.
CREATE OR REPLACE FUNCTION public.capture_contract_signed_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_forklift public.forklifts%ROWTYPE;
  v_template jsonb;
  v_overrides jsonb;
  v_version_id uuid;
  v_checksum text;
  v_assignment_count integer;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.signed_snapshot IS NOT NULL
     AND NEW.signed_snapshot IS DISTINCT FROM OLD.signed_snapshot THEN
    RAISE EXCEPTION 'El respaldo del contrato firmado no puede modificarse'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.signed_snapshot IS NOT NULL
     AND NEW.legal_template_version_id IS DISTINCT FROM OLD.legal_template_version_id THEN
    RAISE EXCEPTION 'La versión legal de un contrato firmado no puede modificarse'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'signed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'signed')
     AND NEW.signed_snapshot IS NULL THEN

    SELECT count(*) INTO v_assignment_count
    FROM public.organization_legal_template_assignments a
    JOIN public.legal_template_definitions d ON d.id = a.definition_id
    JOIN public.legal_template_versions v ON v.id = a.version_id
    WHERE a.organization_id = NEW.organization_id
      AND a.is_active
      AND d.is_active
      AND d.document_type = 'rental_contract';

    IF v_assignment_count = 0 THEN
      RAISE EXCEPTION 'La organización no tiene una versión legal activa para contratos'
        USING ERRCODE = 'check_violation';
    ELSIF v_assignment_count > 1 THEN
      RAISE EXCEPTION 'La organización tiene más de una versión legal activa para contratos'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT v.id, v.checksum_sha256, v.content, a.local_overrides
      INTO v_version_id, v_checksum, v_template, v_overrides
    FROM public.organization_legal_template_assignments a
    JOIN public.legal_template_definitions d ON d.id = a.definition_id
    JOIN public.legal_template_versions v ON v.id = a.version_id
    WHERE a.organization_id = NEW.organization_id
      AND a.is_active
      AND d.is_active
      AND d.document_type = 'rental_contract';

    SELECT c.* INTO v_customer
      FROM public.customers c
      JOIN public.organization_customers oc ON oc.customer_id = c.id
      WHERE c.id = NEW.customer_id
        AND oc.organization_id = NEW.organization_id
        AND oc.status = 'active';
    SELECT * INTO v_forklift
      FROM public.forklifts
      WHERE id = NEW.forklift_id AND organization_id = NEW.organization_id;

    IF v_customer.id IS NULL THEN
      RAISE EXCEPTION 'El cliente no pertenece a la organización del contrato'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_forklift.id IS NULL THEN
      RAISE EXCEPTION 'El montacargas no pertenece a la organización del contrato'
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.legal_template_version_id := v_version_id;
    NEW.signed_snapshot := jsonb_build_object(
      'captured_at', now(),
      'legal_template_version_id', v_version_id,
      'legal_template_checksum_sha256', v_checksum,
      'template_local_overrides', coalesce(v_overrides, '{}'::jsonb),
      'contract', to_jsonb(NEW) - 'signed_snapshot',
      'customer', CASE WHEN v_customer.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_customer.id,
        'name', v_customer.name,
        'rfc', v_customer.rfc,
        'address', v_customer.address,
        'contact_person', v_customer.contact_person,
        'representante_legal', v_customer.representante_legal,
        'domicilio_fiscal_cp', v_customer.domicilio_fiscal_cp
      ) END,
      'forklift', CASE WHEN v_forklift.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_forklift.id,
        'manufacturer', v_forklift.manufacturer,
        'model', v_forklift.model,
        'serial_number', v_forklift.serial_number,
        'capacity_kg', v_forklift.capacity_kg,
        'fuel_type', v_forklift.fuel_type,
        'acquisition_cost', v_forklift.acquisition_cost
      ) END,
      'template', v_template
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_contract_signed_snapshot()
  FROM PUBLIC, anon, authenticated;

-- Los borradores pueden registrar la versión actualmente adoptada para
-- trazabilidad. Los contratos ya firmados conservan su snapshot histórico.
UPDATE public.contracts c
SET legal_template_version_id = a.version_id
FROM public.organization_legal_template_assignments a
JOIN public.legal_template_definitions d ON d.id = a.definition_id
WHERE c.organization_id = a.organization_id
  AND c.legal_template_version_id IS NULL
  AND c.signed_snapshot IS NULL
  AND a.is_active
  AND d.is_active
  AND d.document_type = 'rental_contract';

DO $verify$
DECLARE
  v_active_orgs integer;
  v_assigned_orgs integer;
BEGIN
  SELECT count(*) INTO v_active_orgs FROM public.organizations WHERE is_active;
  SELECT count(DISTINCT a.organization_id) INTO v_assigned_orgs
  FROM public.organization_legal_template_assignments a
  JOIN public.legal_template_definitions d ON d.id = a.definition_id
  WHERE a.is_active AND d.is_active AND d.document_type = 'rental_contract';

  IF v_assigned_orgs <> v_active_orgs THEN
    RAISE EXCEPTION 'POSTFLIGHT 0049: organizaciones asignadas % de %',
      v_assigned_orgs, v_active_orgs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts'
      AND column_name = 'legal_template_version_id'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT 0049: falta contracts.legal_template_version_id';
  END IF;
END;
$verify$;
