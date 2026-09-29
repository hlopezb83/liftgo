-- Match the availability RPC to the E2E exclusion already used by the fleet
-- list. A fixture invisible in the UI must never be returned as selectable.
CREATE OR REPLACE FUNCTION public.get_available_forklifts(p_start_date date, p_end_date date)
RETURNS SETOF public.forklifts
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_buffer interval := make_interval(days => public.maintenance_buffer_days());
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'administrativo'::app_role)
    OR public.has_role(v_uid, 'auditor'::app_role)
    OR public.has_role(v_uid, 'dispatcher'::app_role)
    OR public.has_role(v_uid, 'ventas'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT f.*
    FROM public.forklifts f
   WHERE f.status IN ('available', 'rented')
     AND f.deleted_at IS NULL
     AND COALESCE(f.is_e2e, false) = false
     AND NOT EXISTS (
       SELECT 1 FROM public.bookings b
        WHERE b.forklift_id = f.id
          AND b.status NOT IN ('completed', 'cancelled')
          AND b.start_date <= p_end_date
          AND b.end_date >= p_start_date
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.bookings b
        WHERE b.forklift_id = f.id
          AND b.status = 'confirmed'
          AND b.start_date <= public.today_mty()
          AND b.end_date < public.today_mty()
          AND NOT public.booking_is_returned(b.id)
     )
     AND NOT EXISTS (
       SELECT 1
         FROM (
           SELECT DISTINCT ON (ml.forklift_id) ml.forklift_id, ml.next_service_date
             FROM public.maintenance_logs ml
            WHERE ml.next_service_date IS NOT NULL
              AND ml.deleted_at IS NULL
              AND ml.work_status NOT IN ('scheduled', 'cancelled')
            ORDER BY ml.forklift_id, ml.performed_at DESC
         ) latest
        WHERE latest.forklift_id = f.id
          AND latest.next_service_date - v_buffer <= p_end_date
          AND latest.next_service_date + v_buffer >= p_start_date
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.maintenance_logs ml
        WHERE ml.forklift_id = f.id
          AND ml.work_status IN ('pending', 'in_progress', 'waiting_parts')
          AND ml.deleted_at IS NULL
     )
   ORDER BY f.name;
END;
$function$;

-- Validate the official CLABE check digit (weights 3, 7, 1). A checksum is a
-- typo detector; it does not prove that the account exists or belongs to the
-- named supplier. Also reject the all-zero placeholder used in audit data.
CREATE OR REPLACE FUNCTION public.is_valid_clabe(p_clabe text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_clabe text := btrim(p_clabe);
  v_sum integer := 0;
  v_weight integer;
BEGIN
  IF p_clabe IS NULL OR v_clabe = '' THEN
    RETURN true;
  END IF;
  IF v_clabe !~ '^[0-9]{18}$' OR v_clabe = repeat('0', 18) THEN
    RETURN false;
  END IF;

  FOR i IN 1..17 LOOP
    v_weight := CASE mod(i - 1, 3) WHEN 0 THEN 3 WHEN 1 THEN 7 ELSE 1 END;
    v_sum := v_sum + mod(substring(v_clabe FROM i FOR 1)::integer * v_weight, 10);
  END LOOP;

  RETURN mod(10 - mod(v_sum, 10), 10) = substring(v_clabe FROM 18 FOR 1)::integer;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_supplier_bank_account_clabe()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.clabe IS DISTINCT FROM OLD.clabe)
     AND NOT public.is_valid_clabe(NEW.clabe) THEN
    RAISE EXCEPTION 'La CLABE debe tener 18 dígitos y un dígito verificador válido.'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'supplier_bank_accounts_clabe_checksum';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_supplier_bank_account_clabe ON public.supplier_bank_accounts;
CREATE TRIGGER trg_guard_supplier_bank_account_clabe
  BEFORE INSERT OR UPDATE OF clabe ON public.supplier_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bank_account_clabe();

CREATE OR REPLACE FUNCTION public.guard_supplier_payment_batch_item_clabe()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.clabe IS NULL
     OR length(btrim(NEW.clabe)) <> 18
     OR NOT public.is_valid_clabe(NEW.clabe) THEN
    RAISE EXCEPTION 'No se puede preparar el pago: la CLABE no tiene un dígito verificador válido.'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'supplier_payment_batch_items_clabe_checksum';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_supplier_payment_batch_item_clabe ON public.supplier_payment_batch_items;
CREATE TRIGGER trg_guard_supplier_payment_batch_item_clabe
  BEFORE INSERT OR UPDATE OF clabe ON public.supplier_payment_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_payment_batch_item_clabe();
