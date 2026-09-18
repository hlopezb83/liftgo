
-- ============================================================
-- BL-23: bloquear ediciones de contratos firmados/cancelados
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_signed_contract_lock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('signed','cancelled') THEN
    -- Sólo permitir cambio de status (a cancelled) por admin
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Sólo un administrador puede cambiar el estado de un contrato firmado o cancelado'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    -- Bloquear cambios a campos económicos o de fechas
    IF NEW.daily_rate IS DISTINCT FROM OLD.daily_rate
       OR NEW.weekly_rate IS DISTINCT FROM OLD.weekly_rate
       OR NEW.monthly_rate IS DISTINCT FROM OLD.monthly_rate
       OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.terms_text IS DISTINCT FROM OLD.terms_text
       OR NEW.extra_hour_rate IS DISTINCT FROM OLD.extra_hour_rate
       OR NEW.max_hours_per_month IS DISTINCT FROM OLD.max_hours_per_month THEN
      RAISE EXCEPTION 'No se pueden editar los campos de un contrato firmado o cancelado'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contracts_signed_lock ON public.contracts;
CREATE TRIGGER trg_contracts_signed_lock
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.enforce_signed_contract_lock();

-- ============================================================
-- BL-27: auto-expirar cotizaciones vencidas
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stale_quotes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.quotes
       SET status = 'expired', updated_at = now()
     WHERE status IN ('sent','draft')
       AND valid_until IS NOT NULL
       AND valid_until < CURRENT_DATE
     RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_stale_quotes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.expire_stale_quotes() TO authenticated, service_role;

-- ============================================================
-- BL-30: vista de facturas vencidas para reportes
-- ============================================================
CREATE OR REPLACE VIEW public.v_overdue_invoices AS
SELECT
  i.id,
  i.invoice_number,
  i.customer_id,
  i.customer_name,
  i.due_date,
  i.total,
  COALESCE(v.balance, i.total) AS balance,
  (CURRENT_DATE - i.due_date)::integer AS days_overdue,
  CASE
    WHEN (CURRENT_DATE - i.due_date) <= 30 THEN '0-30'
    WHEN (CURRENT_DATE - i.due_date) <= 60 THEN '31-60'
    WHEN (CURRENT_DATE - i.due_date) <= 90 THEN '61-90'
    ELSE '90+'
  END AS bucket
FROM public.invoices i
LEFT JOIN public.v_invoices_with_balance v ON v.id = i.id
WHERE i.status NOT IN ('paid','cancelled')
  AND i.due_date IS NOT NULL
  AND i.due_date < CURRENT_DATE
  AND COALESCE(v.balance, i.total) > 0;

GRANT SELECT ON public.v_overdue_invoices TO authenticated;
