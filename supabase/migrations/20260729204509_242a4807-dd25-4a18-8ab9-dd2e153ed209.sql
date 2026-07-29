-- DB3-01: cancelacion SAT legitima via service_role
CREATE OR REPLACE FUNCTION public.guard_invoice_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motivo text;
  v_jwt_role text;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;

    IF OLD.cfdi_uuid IS NOT NULL
       AND COALESCE(OLD.cancellation_status, 'none') <> 'accepted'
       AND NOT (
         NEW.cancellation_status = 'accepted'
         AND (v_jwt_role = 'service_role' OR current_setting('app.sat_flow', true) = 'on')
       ) THEN
      RAISE EXCEPTION 'La factura esta timbrada (cfdi_uuid=%): usa el flujo de cancelacion SAT, no la cancelacion directa', OLD.cfdi_uuid
        USING ERRCODE = 'check_violation';
    END IF;

    v_motivo := public.assert_invoice_cancellable(OLD.id);
    IF v_motivo IS NOT NULL THEN
      RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_cancellation ON public.invoices;
CREATE TRIGGER trg_guard_invoice_cancellation
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_cancellation();

-- DB3-02: endurecer guard_invoice_fiscal_metadata (INSERT + 5 columnas)
CREATE OR REPLACE FUNCTION public.guard_invoice_fiscal_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  BEGIN v_jwt_role := auth.jwt() ->> 'role'; EXCEPTION WHEN OTHERS THEN v_jwt_role := NULL; END;
  IF v_jwt_role = 'service_role'
     OR v_jwt_role IS NULL
     OR current_setting('app.sat_flow', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.cfdi_uuid IS NOT NULL
       OR COALESCE(NEW.cfdi_status, 'pending') <> 'pending'
       OR COALESCE(NEW.cancellation_status, 'none') <> 'none'
       OR NEW.facturapi_invoice_id IS NOT NULL
       OR NEW.cancellation_motive IS NOT NULL THEN
      RAISE EXCEPTION 'Los metadatos fiscales (cfdi_uuid, cfdi_status, cancellation_status, cancellation_motive, facturapi_invoice_id) solo los escribe el flujo de timbrado/cancelacion SAT. Crea la factura en borrador y timbra por el flujo oficial.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.cfdi_uuid IS DISTINCT FROM OLD.cfdi_uuid THEN
    RAISE EXCEPTION 'cfdi_uuid no es editable fuera del flujo de timbrado/cancelacion SAT (valor actual: %).', OLD.cfdi_uuid
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.cfdi_status IS DISTINCT FROM OLD.cfdi_status THEN
    RAISE EXCEPTION 'cfdi_status no es editable fuera del flujo de timbrado/cancelacion SAT (valor actual: %).', OLD.cfdi_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.cancellation_status IS DISTINCT FROM OLD.cancellation_status THEN
    RAISE EXCEPTION 'cancellation_status solo lo puede modificar el flujo de cancelacion SAT (valor actual: %).', OLD.cancellation_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.cancellation_motive IS DISTINCT FROM OLD.cancellation_motive THEN
    RAISE EXCEPTION 'cancellation_motive solo lo puede modificar el flujo de cancelacion SAT (valor actual: %).', OLD.cancellation_motive
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.facturapi_invoice_id IS DISTINCT FROM OLD.facturapi_invoice_id THEN
    RAISE EXCEPTION 'facturapi_invoice_id no es editable fuera del flujo de timbrado/cancelacion.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_fiscal_metadata ON public.invoices;
CREATE TRIGGER trg_guard_invoice_fiscal_metadata
  BEFORE INSERT OR UPDATE OF cfdi_uuid, cfdi_status, cancellation_status, cancellation_motive, facturapi_invoice_id
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_fiscal_metadata();