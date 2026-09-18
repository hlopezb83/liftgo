CREATE OR REPLACE FUNCTION public.capture_contract_signed_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_forklift public.forklifts%ROWTYPE;
  v_template jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.signed_snapshot IS NOT NULL
     AND NEW.signed_snapshot IS DISTINCT FROM OLD.signed_snapshot THEN
    RAISE EXCEPTION 'El respaldo del contrato firmado no puede modificarse'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'signed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'signed')
     AND NEW.signed_snapshot IS NULL THEN

    SELECT * INTO v_customer FROM public.customers WHERE id = NEW.customer_id;
    SELECT * INTO v_forklift FROM public.forklifts WHERE id = NEW.forklift_id;

    SELECT jsonb_build_object(
             'intro_text', t.intro_text,
             'declarations_landlord', t.declarations_landlord,
             'declarations_tenant', t.declarations_tenant,
             'clauses', t.clauses,
             'checklist_sections', t.checklist_sections,
             'pagare_text', t.pagare_text
           )
      INTO v_template
      FROM public.contract_templates t
     WHERE t.is_default = true
     ORDER BY t.updated_at DESC
     LIMIT 1;

    NEW.signed_snapshot := jsonb_build_object(
      'captured_at', now(),
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
$function$;

REVOKE ALL ON FUNCTION public.capture_contract_signed_snapshot() FROM PUBLIC, anon, authenticated;