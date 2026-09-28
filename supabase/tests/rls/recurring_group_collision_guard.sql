-- A stale grouped preview must not mark an unbilled booking as billed.
-- The transaction is rolled back after testing both collision and idempotence.
BEGIN;

DO $$
DECLARE
  v_org uuid := '75000000-0000-4000-8000-000000000001';
  v_customer uuid := '75000000-0000-4000-8000-000000000002';
BEGIN
  PERFORM set_config('app.organization_id', v_org::text, true);
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Elevación de Prueba', 'recurring-collision-guard');
  INSERT INTO public.customers (id, name, created_by_organization_id)
  VALUES (v_customer, 'Aceros de Prueba SA de CV', v_org);
  INSERT INTO public.organization_customers (organization_id, customer_id)
  VALUES (v_org, v_customer);
  INSERT INTO public.forklifts (id, name, model, status, organization_id) VALUES
    ('75000000-0000-4000-8000-000000000003', 'MC-01', 'Toyota', 'available', v_org),
    ('75000000-0000-4000-8000-000000000004', 'MC-02', 'Hyster', 'available', v_org);
  INSERT INTO public.bookings
    (id, booking_number, forklift_id, customer_id, start_date, end_date,
     status, recurring_billing, organization_id)
  VALUES
    ('75000000-0000-4000-8000-000000000005', 'RES-T-0001',
     '75000000-0000-4000-8000-000000000003', v_customer,
     current_date - 30, current_date + 30, 'confirmed', true, v_org),
    ('75000000-0000-4000-8000-000000000006', 'RES-T-0002',
     '75000000-0000-4000-8000-000000000004', v_customer,
     current_date - 30, current_date + 30, 'confirmed', true, v_org);
  INSERT INTO public.invoices
    (id, invoice_number, booking_id, customer_id, status, line_items,
     subtotal, tax_amount, total, billing_period_start, billing_period_end,
     organization_id)
  VALUES
    ('75000000-0000-4000-8000-000000000007', 'FAC-T-0001',
     '75000000-0000-4000-8000-000000000005', v_customer, 'draft',
     '[{"description":"Renta","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
     10000, 1600, 11600, current_date - 30, current_date, v_org);
  INSERT INTO public.invoice_bookings (invoice_id, booking_id, organization_id)
  VALUES ('75000000-0000-4000-8000-000000000007',
          '75000000-0000-4000-8000-000000000005', v_org);
END;
$$;

SET LOCAL role = 'service_role';
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';

DO $$
DECLARE
  v_a uuid := '75000000-0000-4000-8000-000000000005';
  v_b uuid := '75000000-0000-4000-8000-000000000006';
  v_customer uuid := '75000000-0000-4000-8000-000000000002';
  v_result record;
BEGIN
  BEGIN
    PERFORM public.create_recurring_invoice(
      ARRAY[v_a, v_b], v_customer, 'Aceros de Prueba SA de CV',
      '[{"description":"Renta","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
      10000, 16, 1600, 11600, current_date - 30, current_date,
      NULL, NULL, NULL, NULL, 'G03', 'MXN', 1);
    RAISE EXCEPTION 'El grupo parcialmente facturado fue aceptado';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'El grupo de reservas cambió:%' THEN
      RAISE;
    END IF;
  END;

  IF (SELECT last_billed_date FROM public.bookings WHERE id = v_b) IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva B se marcó facturada tras el choque';
  END IF;
  IF (SELECT count(*) FROM public.invoices
      WHERE organization_id = '75000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'El choque insertó otra factura';
  END IF;

  SELECT * INTO v_result FROM public.create_recurring_invoice(
    ARRAY[v_a], v_customer, 'Aceros de Prueba SA de CV',
    '[{"description":"Renta","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
    10000, 16, 1600, 11600, current_date - 30, current_date,
    NULL, NULL, NULL, NULL, 'G03', 'MXN', 1);
  IF v_result.invoice_id <> '75000000-0000-4000-8000-000000000007'
     OR v_result.already_existed IS NOT TRUE THEN
    RAISE EXCEPTION 'La repetición exacta no devolvió la factura existente';
  END IF;

  -- Facturas antiguas pueden tener sólo invoices.booking_id, sin pivote.
  DELETE FROM public.invoice_bookings
   WHERE invoice_id = '75000000-0000-4000-8000-000000000007';
  BEGIN
    PERFORM public.create_recurring_invoice(
      ARRAY[v_a, v_b], v_customer, 'Aceros de Prueba SA de CV',
      '[{"description":"Renta","quantity":1,"unit_price":10000,"amount":10000}]'::jsonb,
      10000, 16, 1600, 11600, current_date - 30, current_date,
      NULL, NULL, NULL, NULL, 'G03', 'MXN', 1);
    RAISE EXCEPTION 'El grupo parcial con vínculo directo fue aceptado';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'El grupo de reservas cambió:%' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT last_billed_date FROM public.bookings WHERE id = v_b) IS NOT NULL THEN
    RAISE EXCEPTION 'La reserva B se marcó facturada con vínculo directo';
  END IF;
  RAISE NOTICE 'OK: grupos parciales rechazados sin escrituras; repetición exacta idempotente';
END;
$$;

ROLLBACK;
