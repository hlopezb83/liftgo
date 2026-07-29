-- DB4-08 (a) N-r4-1: mensaje del guard de valid_until alineado con la whitelist real.
CREATE OR REPLACE FUNCTION public.guard_quote_valid_until()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'draft' AND NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
    IF OLD.status = 'expired' AND NEW.status = 'draft'
       AND NEW.valid_until IS NOT NULL AND NEW.valid_until >= current_date THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'No se puede modificar valid_until de una cotizacion en estado %. Extiende la vigencia mientras este en draft, o deja que expire (sent -> expired) y rescatala a draft con una vigencia futura.', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- DB4-08 (b) N-r4-2: firmar/activar exige unidad.
CREATE OR REPLACE FUNCTION public.guard_contract_signable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('signed','active') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF COALESCE(NEW.daily_rate, 0) < 0 OR COALESCE(NEW.weekly_rate, 0) < 0
       OR COALESCE(NEW.monthly_rate, 0) < 0 OR COALESCE(NEW.deposit_amount, 0) < 0 THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato con tasas o deposito negativos'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.customer_id IS NULL THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato sin cliente (customer_id)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.forklift_id IS NULL THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato sin montacargas (forklift_id)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato sin fechas de vigencia (start_date/end_date)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.end_date < NEW.start_date THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato con fecha final anterior a la inicial'
        USING ERRCODE = 'check_violation';
    END IF;
    IF COALESCE(NEW.monthly_rate, 0) <= 0 AND COALESCE(NEW.daily_rate, 0) <= 0 THEN
      RAISE EXCEPTION 'No se puede firmar/activar un contrato sin tarifa: monthly_rate o daily_rate deben ser mayores a cero'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_contract_signable ON public.contracts;
CREATE TRIGGER trg_guard_contract_signable
  BEFORE INSERT OR UPDATE OF status, daily_rate, weekly_rate, monthly_rate, deposit_amount,
                            customer_id, forklift_id, start_date, end_date ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_contract_signable();