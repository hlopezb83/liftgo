-- 0053: congela los datos fiscales del emisor al firmar. Los snapshots
-- historicos permanecen intactos; no se inventan valores retroactivos.

CREATE OR REPLACE FUNCTION public.capture_contract_signed_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_forklift public.forklifts%ROWTYPE;
  v_issuer public.company_settings%ROWTYPE;
  v_template jsonb;
  v_overrides jsonb;
  v_version_id uuid;
  v_checksum text;
  v_assignment_count integer;
  v_issuer_count integer;
BEGIN
  -- El snapshot se crea exclusivamente en el trigger. Un cliente no puede
  -- inyectar datos fiscales ni reemplazar una copia histórica.
  IF (TG_OP = 'INSERT' AND NEW.signed_snapshot IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND OLD.signed_snapshot IS NULL
         AND NEW.signed_snapshot IS NOT NULL) THEN
    RAISE EXCEPTION 'El respaldo del contrato firmado lo genera el servidor'
      USING ERRCODE = 'check_violation';
  END IF;

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

    SELECT count(*) INTO v_issuer_count
    FROM public.company_settings
    WHERE organization_id = NEW.organization_id;
    IF v_issuer_count <> 1 THEN
      RAISE EXCEPTION 'La organización requiere una configuración fiscal única antes de firmar'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_issuer
    FROM public.company_settings
    WHERE organization_id = NEW.organization_id;
    IF nullif(btrim(v_issuer.razon_social), '') IS NULL
       OR nullif(btrim(v_issuer.rfc), '') IS NULL
       OR nullif(btrim(v_issuer.regimen_fiscal), '') IS NULL
       OR nullif(btrim(v_issuer.lugar_expedicion), '') IS NULL THEN
      RAISE EXCEPTION 'Completa los datos fiscales de la organización antes de firmar'
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.legal_template_version_id := v_version_id;
    NEW.signed_snapshot := jsonb_build_object(
      'captured_at', now(),
      'legal_template_version_id', v_version_id,
      'legal_template_checksum_sha256', v_checksum,
      'issuer', jsonb_build_object(
        'organization_id', NEW.organization_id,
        'razon_social', v_issuer.razon_social,
        'rfc', v_issuer.rfc,
        'regimen_fiscal', v_issuer.regimen_fiscal,
        'lugar_expedicion', v_issuer.lugar_expedicion
      ),
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

