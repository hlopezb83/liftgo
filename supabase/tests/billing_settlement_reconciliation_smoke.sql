-- BF03/BF04 regression gate against the fully migrated local/CI schema.
-- Synthetic records only; the transaction rolls back. No provider request.
-- Stamped/cancelled fixtures represent accepted server outcomes, not real CFDIs.
\set ON_ERROR_STOP on
BEGIN;
\ir fixtures/smoke_context.inc

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS NOT TRUE THEN RAISE EXCEPTION 'FALLO %', p_label; END IF;
  RAISE NOTICE 'OK %', p_label;
END; $$;

DO $regression$
DECLARE
  v_org uuid := current_setting('app.organization_id')::uuid;
  v_customer uuid := gen_random_uuid();
  v_paid_invoice uuid := gen_random_uuid();
  v_credit_invoice uuid := gen_random_uuid();
  v_partial_invoice uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
  v_note40 uuid := gen_random_uuid();
  v_note60 uuid := gen_random_uuid();
  v_status text;
  v_paid_at date;
  v_balance numeric;
  v_ctid text;
BEGIN
  -- Customer identity is global; the operational tenant FK targets the
  -- organization_customers relation. The normal customer trigger may already
  -- create this relation in single-organization CI, so keep setup idempotent.
  INSERT INTO public.customers(id, name)
  VALUES(v_customer, 'BF03 BF04 regression customer');
  INSERT INTO public.organization_customers(organization_id, customer_id)
  VALUES(v_org, v_customer)
  ON CONFLICT (organization_id, customer_id) DO NOTHING;
  PERFORM pg_temp.expect_true('fixture global customer is linked to the invoice organization',
    EXISTS (SELECT 1 FROM public.organization_customers
      WHERE organization_id=v_org AND customer_id=v_customer));

  INSERT INTO public.invoices(
    id, organization_id, customer_id, customer_name, invoice_number,
    subtotal, tax_rate, tax_amount, total, status, issued_at, due_date,
    moneda, tipo_cambio, line_items
  ) VALUES
    (v_paid_invoice, v_org, v_customer, 'BF regression', 'BF03-' || v_paid_invoice::text,
      100, 0, 0, 100, 'sent', public.today_mty()-30, public.today_mty()+30, 'MXN', 1,
      '[{"description":"QA settlement","quantity":1,"unit_price":100,"total":100,"tax_rate":0}]'),
    (v_credit_invoice, v_org, v_customer, 'BF regression', 'BF04-' || v_credit_invoice::text,
      100, 0, 0, 100, 'sent', public.today_mty()-30, public.today_mty()+30, 'MXN', 1,
      '[{"description":"QA credits","quantity":1,"unit_price":100,"total":100,"tax_rate":0}]'),
    (v_partial_invoice, v_org, v_customer, 'BF regression', 'BF-CTL-' || v_partial_invoice::text,
      100, 0, 0, 100, 'sent', public.today_mty()-30, public.today_mty()+30, 'MXN', 1,
      '[{"description":"QA partial","quantity":1,"unit_price":100,"total":100,"tax_rate":0}]');

  INSERT INTO public.payments(id, organization_id, invoice_id, amount, payment_date, currency)
  VALUES(v_payment, v_org, v_paid_invoice, 100, public.today_mty()-10, 'MXN');
  SELECT status, paid_at INTO v_status, v_paid_at FROM public.invoices WHERE id=v_paid_invoice;
  PERFORM pg_temp.expect_true('BF03 control full payment settles on payment date',
    v_status='paid' AND v_paid_at=public.today_mty()-10);

  UPDATE public.payments SET payment_date=public.today_mty()-8 WHERE id=v_payment;
  SELECT status, paid_at INTO v_status, v_paid_at FROM public.invoices WHERE id=v_paid_invoice;
  SELECT balance INTO v_balance FROM public.v_invoices_with_balance WHERE id=v_paid_invoice;
  PERFORM pg_temp.expect_true('BF03 date correction refreshes paid_at while status remains paid',
    v_status='paid' AND v_paid_at=public.today_mty()-8 AND v_balance=0);
  UPDATE public.payments SET payment_date=public.today_mty()-12 WHERE id=v_payment;
  SELECT status, paid_at, ctid::text INTO v_status, v_paid_at, v_ctid FROM public.invoices WHERE id=v_paid_invoice;
  PERFORM pg_temp.expect_true('BF03 earlier correction also refreshes paid_at',
    v_status='paid' AND v_paid_at=public.today_mty()-12);
  PERFORM public.sync_invoice_status(v_paid_invoice);
  PERFORM public.sync_invoice_status(v_paid_invoice);
  PERFORM pg_temp.expect_true('BF03 repeated reconciliation is a no-op',
    (SELECT ctid::text=v_ctid AND paid_at=public.today_mty()-12 FROM public.invoices WHERE id=v_paid_invoice));

  INSERT INTO public.payments(organization_id, invoice_id, amount, payment_date, currency)
  VALUES(v_org, v_partial_invoice, 40, public.today_mty()-10, 'MXN');
  PERFORM pg_temp.expect_true('control partial payment retains a null settlement date',
    (SELECT status='partial' AND paid_at IS NULL FROM public.invoices WHERE id=v_partial_invoice));

  INSERT INTO public.credit_notes(
    id, organization_id, invoice_id, customer_id, credit_note_number, motive, reason_text,
    line_items, subtotal, tax_rate, tax_amount, total, currency, status, cfdi_status, cfdi_uuid
  ) VALUES
    (v_note40, v_org, v_credit_invoice, v_customer, 'BF04-40-' || v_note40::text, 'return', 'QA credit40',
      '[{"description":"QA credit40","quantity":1,"unit_price":40,"total":40,"tax_rate":0}]',
      40, 0, 0, 40, 'MXN', 'stamped', 'stamped', gen_random_uuid());
  PERFORM pg_temp.expect_true('control partial credit without payments is partial',
    (SELECT status='partial' AND paid_at IS NULL FROM public.invoices WHERE id=v_credit_invoice));
  INSERT INTO public.credit_notes(
    id, organization_id, invoice_id, customer_id, credit_note_number, motive, reason_text,
    line_items, subtotal, tax_rate, tax_amount, total, currency, status, cfdi_status, cfdi_uuid
  ) VALUES
    (v_note60, v_org, v_credit_invoice, v_customer, 'BF04-60-' || v_note60::text, 'return', 'QA credit60',
      '[{"description":"QA credit60","quantity":1,"unit_price":60,"total":60,"tax_rate":0}]',
      60, 0, 0, 60, 'MXN', 'stamped', 'stamped', gen_random_uuid());
  PERFORM pg_temp.expect_true('control credits40+60 settle the invoice',
    (SELECT status='paid' AND paid_at=public.today_mty() FROM public.invoices WHERE id=v_credit_invoice));

  UPDATE public.credit_notes
    SET status='cancelled', cfdi_status='cancelled', cancellation_status='accepted',
        cancellation_reason='QA accepted cancellation', cancelled_at=now()
    WHERE id=v_note60;
  SELECT status, paid_at, ctid::text INTO v_status, v_paid_at, v_ctid FROM public.invoices WHERE id=v_credit_invoice;
  SELECT balance INTO v_balance FROM public.v_invoices_with_balance WHERE id=v_credit_invoice;
  PERFORM pg_temp.expect_true('BF04 cancel credit60 immediately produces partial with balance60',
    v_status='partial' AND v_paid_at IS NULL AND v_balance=60);
  PERFORM public.sync_invoice_status(v_credit_invoice);
  PERFORM public.sync_invoice_status(v_credit_invoice);
  PERFORM pg_temp.expect_true('BF04 identical financial state never changes on another sync',
    (SELECT status='partial' AND paid_at IS NULL AND ctid::text=v_ctid FROM public.invoices WHERE id=v_credit_invoice));
  PERFORM pg_temp.expect_true('BF04 reconciliation preserves financial balance',
    (SELECT balance=60 FROM public.v_invoices_with_balance WHERE id=v_credit_invoice));

  UPDATE public.credit_notes
    SET status='cancelled', cfdi_status='cancelled', cancellation_status='accepted',
        cancellation_reason='QA accepted cancellation', cancelled_at=now()
    WHERE id=v_note40;
  PERFORM pg_temp.expect_true('control no remaining payments or credits returns to sent',
    (SELECT status='sent' AND paid_at IS NULL FROM public.invoices WHERE id=v_credit_invoice));
END;
$regression$;
ROLLBACK;
