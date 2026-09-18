-- M-1: cierre de periodos fiscales
CREATE TABLE public.fiscal_periods (
  period text PRIMARY KEY,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_periods_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_periods TO authenticated;
GRANT ALL ON public.fiscal_periods TO service_role;

ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_periods FORCE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_periods_select_authenticated"
  ON public.fiscal_periods FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "fiscal_periods_insert_admin"
  ON public.fiscal_periods FOR INSERT TO authenticated
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::app_role));

CREATE POLICY "fiscal_periods_update_admin"
  ON public.fiscal_periods FOR UPDATE TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::app_role));

CREATE POLICY "fiscal_periods_delete_admin"
  ON public.fiscal_periods FOR DELETE TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::app_role));

CREATE TRIGGER update_fiscal_periods_updated_at
BEFORE UPDATE ON public.fiscal_periods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.guard_fiscal_period_open(_date date, _table_name text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _date IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.fiscal_periods fp
    WHERE fp.period = to_char(_date, 'YYYY-MM')
      AND fp.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'El periodo fiscal % está cerrado; no se pueden registrar fechas en % dentro de ese periodo.',
      to_char(_date, 'YYYY-MM'), _table_name
      USING ERRCODE = 'raise_exception';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_fiscal_period_open(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_fiscal_period_open(date, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_guard_invoice_fiscal_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.guard_fiscal_period_open(NEW.issued_at, 'invoices.issued_at');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_fiscal_period_open ON public.invoices;
CREATE TRIGGER trg_invoices_fiscal_period_open
BEFORE INSERT OR UPDATE OF issued_at ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_guard_invoice_fiscal_period();

CREATE OR REPLACE FUNCTION public.trg_guard_payment_fiscal_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.guard_fiscal_period_open(NEW.payment_date, 'payments.payment_date');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_fiscal_period_open ON public.payments;
CREATE TRIGGER trg_payments_fiscal_period_open
BEFORE INSERT OR UPDATE OF payment_date ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_guard_payment_fiscal_period();

-- M-2: tipo_cambio inmutable tras timbrado/pagos y amount_mxn en payments
CREATE OR REPLACE FUNCTION public.trg_invoice_tipo_cambio_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo_cambio IS DISTINCT FROM OLD.tipo_cambio
     AND (
       OLD.cfdi_uuid IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = OLD.id)
     ) THEN
    RAISE EXCEPTION
      'tipo_cambio es inmutable: la factura % ya está timbrada o tiene pagos registrados.',
      OLD.invoice_number
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_tipo_cambio_inmutable ON public.invoices;
CREATE TRIGGER trg_invoices_tipo_cambio_inmutable
BEFORE UPDATE OF tipo_cambio ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_invoice_tipo_cambio_inmutable();

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_mxn numeric;

CREATE OR REPLACE FUNCTION public.trg_payment_amount_mxn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tipo_cambio numeric;
BEGIN
  SELECT i.tipo_cambio INTO v_tipo_cambio
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;
  NEW.amount_mxn := ROUND(
    COALESCE(NEW.amount, 0) * COALESCE(NULLIF(v_tipo_cambio, 0), NULLIF(NEW.exchange_rate, 0), 1),
    2
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_amount_mxn ON public.payments;
CREATE TRIGGER trg_payments_amount_mxn
BEFORE INSERT OR UPDATE OF amount, exchange_rate, invoice_id ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_payment_amount_mxn();

-- M-4: ventana de validez para payments.payment_date
CREATE OR REPLACE FUNCTION public.trg_payment_date_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_issued_at date;
BEGIN
  IF NEW.payment_date > public.today_mty() + 7 THEN
    RAISE EXCEPTION
      'payment_date % no puede estar más de 7 días en el futuro.',
      NEW.payment_date
      USING ERRCODE = 'raise_exception';
  END IF;
  SELECT i.issued_at INTO v_issued_at
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;
  IF v_issued_at IS NOT NULL AND NEW.payment_date < v_issued_at THEN
    RAISE EXCEPTION
      'payment_date % no puede ser anterior a la fecha de emisión de la factura (%).',
      NEW.payment_date, v_issued_at
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_payment_date_window ON public.payments;
CREATE TRIGGER trg_payments_payment_date_window
BEFORE INSERT OR UPDATE OF payment_date, invoice_id ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_payment_date_window();