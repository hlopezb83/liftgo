-- Baja: máquina de estados de contratos para admin:
--   signed/active → completed|cancelled (nunca de regreso a draft/sent);
--   cancelled → terminal.
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_dominio;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_dominio
  CHECK (status IN ('draft','sent','signed','active','completed','cancelled')) NOT VALID;
ALTER TABLE public.contracts VALIDATE CONSTRAINT contracts_status_dominio;

CREATE OR REPLACE FUNCTION public.enforce_signed_contract_lock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('signed','active','cancelled') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Solo un administrador puede cambiar el estado de un contrato firmado, activo o cancelado'
          USING ERRCODE = 'P0001';
      END IF;
      IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'Un contrato cancelado es terminal y no puede reactivarse (destino: %).', NEW.status
          USING ERRCODE = 'P0001';
      END IF;
      IF NEW.status NOT IN ('completed','cancelled') THEN
        RAISE EXCEPTION 'Un contrato % solo puede pasar a completed o cancelled; no se puede regresar a %.',
          OLD.status, NEW.status
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF NEW.daily_rate IS DISTINCT FROM OLD.daily_rate
       OR NEW.weekly_rate IS DISTINCT FROM OLD.weekly_rate
       OR NEW.monthly_rate IS DISTINCT FROM OLD.monthly_rate
       OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.terms_text IS DISTINCT FROM OLD.terms_text
       OR NEW.extra_hour_rate IS DISTINCT FROM OLD.extra_hour_rate
       OR NEW.max_hours_per_month IS DISTINCT FROM OLD.max_hours_per_month THEN
      RAISE EXCEPTION 'No se pueden editar los campos de un contrato firmado, activo o cancelado'
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
