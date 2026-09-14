-- Multi-organización · Fase 6.3: umbral CxP por organización.
BEGIN;

DO $$
DECLARE
  v_org_a uuid := 'e8000000-0000-4000-8000-0000000000a1';
  v_org_b uuid := 'e8000000-0000-4000-8000-0000000000b1';
  v_status_a public.supplier_bill_approval_status;
  v_status_b public.supplier_bill_approval_status;
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.set_supplier_bill_approval_status()'::regprocedure
  ) INTO v_definition;

  IF v_definition NOT ILIKE
     '%WHERE cs.organization_id = NEW.organization_id%' THEN
    RAISE EXCEPTION
      'CXP ORG: el trigger debe consultar el umbral por NEW.organization_id';
  END IF;

  INSERT INTO public.organizations (id, name, slug)
  VALUES
    (v_org_a, 'Organización A CxP', 'cxp-org-a'),
    (v_org_b, 'Organización B CxP', 'cxp-org-b');

  PERFORM set_config('app.organization_id', v_org_a::text, true);
  INSERT INTO public.company_settings (
    organization_id,
    rfc,
    razon_social,
    regimen_fiscal,
    lugar_expedicion,
    cxp_approval_threshold_mxn
  )
  VALUES (
    v_org_a,
    'XAXX010101000',
    'Configuración A CxP',
    '601',
    '01000',
    500
  );

  INSERT INTO public.supplier_bills (
    organization_id,
    bill_number,
    subtotal,
    tax_amount,
    total,
    currency,
    exchange_rate
  )
  VALUES (
    v_org_a,
    'CXP-ORG-A-001',
    1000,
    0,
    1000,
    'MXN',
    1
  )
  RETURNING approval_status INTO v_status_a;

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.company_settings (
    organization_id,
    rfc,
    razon_social,
    regimen_fiscal,
    lugar_expedicion,
    cxp_approval_threshold_mxn
  )
  VALUES (
    v_org_b,
    'XEXX010101000',
    'Configuración B CxP',
    '601',
    '01001',
    2000
  );

  INSERT INTO public.supplier_bills (
    organization_id,
    bill_number,
    subtotal,
    tax_amount,
    total,
    currency,
    exchange_rate
  )
  VALUES (
    v_org_b,
    'CXP-ORG-B-001',
    1000,
    0,
    1000,
    'MXN',
    1
  )
  RETURNING approval_status INTO v_status_b;

  IF v_status_a <> 'pending'::public.supplier_bill_approval_status THEN
    RAISE EXCEPTION
      'CXP ORG: A debía requerir aprobación con umbral 500; obtuvo %',
      v_status_a;
  END IF;

  IF v_status_b <> 'not_required'::public.supplier_bill_approval_status THEN
    RAISE EXCEPTION
      'CXP ORG: B no debía requerir aprobación con umbral 2000; obtuvo %',
      v_status_b;
  END IF;
END;
$$;

ROLLBACK;
