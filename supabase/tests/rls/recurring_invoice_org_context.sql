-- Con dos empresas activas, el proceso de servicio (sin usuario ni contexto
-- previo) debe facturar una reserva recurrente con la empresa de la reserva.
-- Regresión del error 23514 "Se requiere contexto de organización...".
-- Todo se revierte al final.
BEGIN;

DO $$
DECLARE
  v_org_a uuid := '96000000-0000-4000-8000-00000000000a';
  v_org_b uuid := '96000000-0000-4000-8000-00000000000b';
  v_customer uuid := '96000000-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Empresa A Prueba', 'recurring-org-ctx-a'),
    (v_org_b, 'Empresa B Prueba', 'recurring-org-ctx-b');

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.customers (id, name, created_by_organization_id)
  VALUES (v_customer, 'Cliente B SA de CV', v_org_b);
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org_b, v_customer);
  INSERT INTO public.forklifts (id, name, model, status, organization_id)
  VALUES ('96000000-0000-4000-8000-000000000003', 'OC-01', 'Toyota', 'available', v_org_b);
  INSERT INTO public.bookings
    (id, booking_number, forklift_id, customer_id, start_date, end_date,
     status, recurring_billing, organization_id)
  VALUES ('96000000-0000-4000-8000-000000000005', 'RES-OC-0001',
          '96000000-0000-4000-8000-000000000003', v_customer,
          current_date - 30, current_date + 30, 'confirmed', true, v_org_b);

  -- Sin contexto previo, como llega la función de borde.
  PERFORM set_config('app.organization_id', '', true);
END;
$$;

SET LOCAL role = 'service_role';
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';

DO $$
DECLARE
  v_result record;
BEGIN
  IF (SELECT count(*) FROM public.organizations WHERE is_active) < 2 THEN
    RAISE EXCEPTION 'La prueba requiere al menos dos empresas activas';
  END IF;

  SELECT * INTO v_result FROM public.create_recurring_invoice(
    ARRAY['96000000-0000-4000-8000-000000000005'::uuid],
    '96000000-0000-4000-8000-000000000002', 'Cliente B SA de CV',
    '[{"description":"Renta","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
    10000, 16, 1600, 11600, current_date - 30, current_date,
    NULL, NULL, NULL, NULL, 'G03', 'MXN', 1);

  IF v_result.invoice_id IS NULL OR v_result.already_existed THEN
    RAISE EXCEPTION 'No se creó la factura recurrente';
  END IF;
  IF (SELECT organization_id FROM public.invoices WHERE id = v_result.invoice_id)
     <> '96000000-0000-4000-8000-00000000000b' THEN
    RAISE EXCEPTION 'La factura quedó en otra empresa';
  END IF;
  RAISE NOTICE 'OK: folio asignado con la empresa de la reserva y 2+ empresas activas';
END;
$$;

ROLLBACK;
