
-- ============================================================
-- BL-31: bookings guardan su propia tarifa negociada
-- ============================================================
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS daily_rate numeric(14,2),
  ADD COLUMN IF NOT EXISTS weekly_rate numeric(14,2),
  ADD COLUMN IF NOT EXISTS monthly_rate numeric(14,2);

COMMENT ON COLUMN public.bookings.monthly_rate IS
  'Tarifa mensual negociada de la reserva. NULL = usar tarifa maestra de forklifts.';

-- ============================================================
-- BL-24: exclusividad y revalidación en confirm_bank_match
-- ============================================================

-- Antes de crear el índice único, limpiar duplicados existentes (si los hubiera).
-- Estrategia: dejar sólo el más reciente por matched_payment_id / matched_supplier_payment_id.
UPDATE public.bank_statement_lines l
   SET matched_payment_id = NULL,
       matched_supplier_payment_id = NULL,
       status = 'unmatched'
 WHERE matched_payment_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.bank_statement_lines l2
      WHERE l2.matched_payment_id = l.matched_payment_id
        AND l2.id <> l.id
        AND COALESCE(l2.matched_at, 'epoch'::timestamptz) > COALESCE(l.matched_at, 'epoch'::timestamptz)
   );

UPDATE public.bank_statement_lines l
   SET matched_supplier_payment_id = NULL,
       matched_payment_id = NULL,
       status = 'unmatched'
 WHERE matched_supplier_payment_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.bank_statement_lines l2
      WHERE l2.matched_supplier_payment_id = l.matched_supplier_payment_id
        AND l2.id <> l.id
        AND COALESCE(l2.matched_at, 'epoch'::timestamptz) > COALESCE(l.matched_at, 'epoch'::timestamptz)
   );

CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_matched_payment_uq
  ON public.bank_statement_lines(matched_payment_id)
  WHERE matched_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_matched_supplier_payment_uq
  ON public.bank_statement_lines(matched_supplier_payment_id)
  WHERE matched_supplier_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.confirm_bank_match(
  p_line_id uuid,
  p_payment_id uuid DEFAULT NULL,
  p_supplier_payment_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_line_amount numeric(14,2);
  v_pay_amount  numeric(14,2);
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF (p_payment_id IS NULL AND p_supplier_payment_id IS NULL)
     OR (p_payment_id IS NOT NULL AND p_supplier_payment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'debe enviarse exactamente un pago';
  END IF;

  -- Estado de la línea + monto (absoluto)
  SELECT ABS(signed_amount) INTO v_line_amount
  FROM public.bank_statement_lines
  WHERE id = p_line_id
    AND status IN ('unmatched'::bank_line_status, 'suggested'::bank_line_status)
  FOR UPDATE;

  IF v_line_amount IS NULL THEN
    RAISE EXCEPTION 'línea inexistente o ya conciliada' USING ERRCODE = 'P0001';
  END IF;

  -- Monto del pago referido
  IF p_payment_id IS NOT NULL THEN
    SELECT amount INTO v_pay_amount FROM public.payments WHERE id = p_payment_id;
  ELSE
    SELECT amount INTO v_pay_amount FROM public.supplier_payments WHERE id = p_supplier_payment_id;
  END IF;

  IF v_pay_amount IS NULL THEN
    RAISE EXCEPTION 'pago inexistente' USING ERRCODE = 'P0001';
  END IF;

  IF ABS(v_line_amount - v_pay_amount) > 0.01 THEN
    RAISE EXCEPTION 'el monto del pago (%) no coincide con el movimiento (%)',
      v_pay_amount, v_line_amount USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_statement_lines
     SET status = 'matched'::bank_line_status,
         matched_payment_id = p_payment_id,
         matched_supplier_payment_id = p_supplier_payment_id,
         suggested_payment_id = NULL,
         suggested_supplier_payment_id = NULL,
         matched_at = now(),
         matched_by = auth.uid()
   WHERE id = p_line_id;
END;
$$;

-- ============================================================
-- BL-34: MRR usa tarifa pactada en la reserva si existe
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_financial_kpis()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mrr NUMERIC := 0; v_mrr_prev NUMERIC := 0;
  v_dso NUMERIC := 0; v_dso_prev NUMERIC := 0;
  v_overdue_total NUMERIC := 0; v_overdue_total_prev NUMERIC := 0;
  v_expiring jsonb;
  v_today DATE := (now() AT TIME ZONE 'America/Monterrey')::date;
  v_last_prev_month DATE := (date_trunc('month', v_today) - INTERVAL '1 day')::date;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- MRR: preferir tarifa pactada en la reserva; fallback a la maestra del equipo.
  SELECT COALESCE(SUM(COALESCE(b.monthly_rate, f.monthly_rate, 0)), 0)
    INTO v_mrr
    FROM bookings b
    JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true
     AND b.start_date <= v_today
     AND (b.end_date IS NULL OR b.end_date >= v_today);

  SELECT COALESCE(SUM(COALESCE(b.monthly_rate, f.monthly_rate, 0)), 0)
    INTO v_mrr_prev
    FROM bookings b
    JOIN forklifts f ON f.id = b.forklift_id
   WHERE b.recurring_billing = true
     AND b.start_date <= v_last_prev_month
     AND (b.end_date IS NULL OR b.end_date >= v_last_prev_month);

  SELECT COALESCE(AVG((i.paid_at - i.issued_at::date))::numeric, 0) INTO v_dso FROM invoices i
  WHERE i.status = 'paid' AND i.paid_at IS NOT NULL AND i.paid_at >= (v_today - INTERVAL '90 days');

  SELECT COALESCE(AVG((i.paid_at - i.issued_at::date))::numeric, 0) INTO v_dso_prev FROM invoices i
  WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
    AND i.paid_at >= (v_last_prev_month - INTERVAL '90 days') AND i.paid_at <= v_last_prev_month;

  SELECT COALESCE(SUM(v.balance), 0) INTO v_overdue_total
  FROM public.v_invoices_with_balance v
  WHERE v.status IN ('sent', 'partial', 'overdue') AND v.due_date < v_today;

  SELECT COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0) INTO v_overdue_total_prev
  FROM invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(amount) AS paid FROM payments
    WHERE payment_date <= v_last_prev_month GROUP BY invoice_id
  ) p ON p.invoice_id = i.id
  WHERE i.status IN ('sent', 'partial', 'overdue', 'paid')
    AND i.issued_at <= v_last_prev_month
    AND i.due_date < v_last_prev_month
    AND (i.paid_at IS NULL OR i.paid_at > v_last_prev_month);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'contract_number', c.contract_number, 'customer_name', cu.name,
    'forklift_name', f.name, 'end_date', c.end_date, 'days_remaining', (c.end_date - v_today)
  ) ORDER BY c.end_date), '[]'::jsonb) INTO v_expiring
  FROM contracts c LEFT JOIN customers cu ON cu.id = c.customer_id
  LEFT JOIN forklifts f ON f.id = c.forklift_id
  WHERE c.status = 'active' AND c.end_date IS NOT NULL
    AND c.end_date BETWEEN v_today AND (v_today + INTERVAL '30 days');

  RETURN jsonb_build_object(
    'mrr', v_mrr, 'mrr_prev', v_mrr_prev,
    'dso', ROUND(v_dso, 1), 'dso_prev', ROUND(v_dso_prev, 1),
    'overdue_total', v_overdue_total, 'overdue_total_prev', v_overdue_total_prev,
    'expiring_contracts', v_expiring
  );
END;
$$;
