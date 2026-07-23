-- R10 Bloque 8.3: sólo NCs timbradas afectan el balance.
-- Antes: cualquier NC no cancelada (incluyendo drafts) descontaba del total.
CREATE OR REPLACE VIEW public.v_invoices_with_balance
WITH (security_invoker = true) AS
SELECT i.id, i.invoice_number, i.booking_id, i.customer_id, i.customer_name,
  i.line_items, i.subtotal, i.tax_rate, i.tax_amount, i.total, i.status,
  i.issued_at, i.due_date, i.paid_at, i.notes, i.created_at, i.updated_at,
  i.serie, i.folio, i.forma_pago, i.metodo_pago, i.uso_cfdi, i.moneda,
  i.tipo_cambio, i.receptor_rfc, i.receptor_razon_social,
  i.receptor_regimen_fiscal, i.receptor_domicilio_fiscal_cp, i.cfdi_uuid,
  i.cfdi_xml, i.cfdi_status, i.cancelled_at, i.cancellation_reason,
  i.quote_id, i.facturapi_invoice_id, i.billing_period_start,
  i.billing_period_end, i.cfdi_xml_url, i.cfdi_pdf_url, i.cfdi_error_message,
  i.cancellation_status, i.cancellation_motive, i.substitution_uuid,
  i.is_e2e, i.e2e_scope, i.global_periodicity, i.global_months, i.global_year,
  i.acuse_pdf_url, i.acuse_xml_url, i.facturapi_env,
  COALESCE(p.paid, 0::numeric) AS paid_amount,
  COALESCE(cn.credited, 0::numeric) AS credited_amount,
  GREATEST(i.total - COALESCE(p.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric) AS balance,
  round(i.total * COALESCE(NULLIF(i.tipo_cambio, 0::numeric), 1::numeric), 2) AS total_mxn,
  round(GREATEST(i.total - COALESCE(p.paid, 0::numeric) - COALESCE(cn.credited, 0::numeric), 0::numeric) * COALESCE(NULLIF(i.tipo_cambio, 0::numeric), 1::numeric), 2) AS balance_mxn
FROM invoices i
LEFT JOIN (
  SELECT payments.invoice_id, sum(payments.amount) AS paid
  FROM payments GROUP BY payments.invoice_id
) p ON p.invoice_id = i.id
LEFT JOIN (
  SELECT credit_notes.invoice_id, sum(credit_notes.total) AS credited
  FROM credit_notes
  WHERE credit_notes.cancellation_status <> 'accepted'::text
    AND credit_notes.status <> 'cancelled'::text
    AND credit_notes.cfdi_status = 'stamped'::text
  GROUP BY credit_notes.invoice_id
) cn ON cn.invoice_id = i.id;

GRANT SELECT ON public.v_invoices_with_balance TO authenticated, anon, service_role;

-- R10 Bloque 6: bloquear cambios de campos fiscales del pago cuando el REP
-- ya está timbrado (amount, payment_date, currency, exchange_rate,
-- payment_form_sat, installment_number, prior_balance). Se permite editar
-- notas/referencia o mutar campos del REP mismo.
CREATE OR REPLACE FUNCTION public.prevent_payment_mutation_when_rep_stamped()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.rep_cfdi_status = 'stamped' AND (
    NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
    OR NEW.payment_form_sat IS DISTINCT FROM OLD.payment_form_sat
    OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
    OR NEW.prior_balance IS DISTINCT FROM OLD.prior_balance
    OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
  ) THEN
    RAISE EXCEPTION 'No se pueden modificar los campos fiscales de un pago con REP timbrado. Cancele el complemento primero.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_payment_mutation_stamped ON public.payments;
CREATE TRIGGER trg_prevent_payment_mutation_stamped
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_payment_mutation_when_rep_stamped();

DROP TRIGGER IF EXISTS trg_prevent_payment_delete_stamped ON public.payments;
CREATE OR REPLACE FUNCTION public.prevent_payment_delete_when_rep_stamped()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.rep_cfdi_status = 'stamped' THEN
    RAISE EXCEPTION 'No se puede eliminar un pago con REP timbrado. Cancele el complemento primero.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trg_prevent_payment_delete_stamped
BEFORE DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_payment_delete_when_rep_stamped();

-- R10 Bloque 12.4: stock nunca debe ser negativo.
ALTER TABLE public.parts_inventory DROP CONSTRAINT IF EXISTS parts_inventory_stock_nonneg;
ALTER TABLE public.parts_inventory
  ADD CONSTRAINT parts_inventory_stock_nonneg CHECK (stock_quantity >= 0);
