-- A6R2-3: snapshot inmutable del contrato al firmar
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS signed_snapshot jsonb;

COMMENT ON COLUMN public.contracts.signed_snapshot IS
  'A6R2-3: copia de los datos del contrato, cliente y unidad al momento de firmar. El PDF de un contrato firmado debe rendirse desde aqui, no desde datos vivos.';

CREATE OR REPLACE FUNCTION public.capture_contract_signed_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_forklift public.forklifts%ROWTYPE;
BEGIN
  -- Inmutable: una vez capturado no se altera ni se borra.
  IF TG_OP = 'UPDATE' AND OLD.signed_snapshot IS NOT NULL
     AND NEW.signed_snapshot IS DISTINCT FROM OLD.signed_snapshot THEN
    RAISE EXCEPTION 'El respaldo del contrato firmado no puede modificarse'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'signed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'signed')
     AND NEW.signed_snapshot IS NULL THEN

    SELECT * INTO v_customer FROM public.customers WHERE id = NEW.customer_id;
    SELECT * INTO v_forklift FROM public.forklifts WHERE id = NEW.forklift_id;

    NEW.signed_snapshot := jsonb_build_object(
      'captured_at', now(),
      'contract', to_jsonb(NEW) - 'signed_snapshot',
      'customer', CASE WHEN v_customer.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_customer.id,
        'name', v_customer.name,
        'rfc', v_customer.rfc,
        'email', v_customer.email,
        'phone', v_customer.phone,
        'address', v_customer.address
      ) END,
      'forklift', CASE WHEN v_forklift.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_forklift.id,
        'name', v_forklift.name,
        'brand', v_forklift.brand,
        'model', v_forklift.model,
        'serial_number', v_forklift.serial_number,
        'year', v_forklift.year
      ) END
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_capture_contract_signed_snapshot ON public.contracts;
CREATE TRIGGER trg_capture_contract_signed_snapshot
BEFORE INSERT OR UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.capture_contract_signed_snapshot();

-- A6R2-4: ciclo de vida del deposito en garantia
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'held',
  ADD COLUMN IF NOT EXISTS deposit_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_settled_amount numeric,
  ADD COLUMN IF NOT EXISTS deposit_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_deposit_status_check'
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_deposit_status_check
      CHECK (deposit_status IN ('held', 'applied', 'returned'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_contract_deposit_status(
  p_contract_id uuid,
  p_status text,
  p_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_deposit numeric;
  v_current text;
BEGIN
  IF NOT (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('held', 'applied', 'returned') THEN
    RAISE EXCEPTION 'Estado de depósito inválido: %', p_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(deposit_amount, 0), deposit_status
    INTO v_deposit, v_current
    FROM public.contracts WHERE id = p_contract_id FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Contrato no encontrado';
  END IF;

  IF p_status <> 'held' AND v_deposit <= 0 THEN
    RAISE EXCEPTION 'El contrato no tiene depósito en garantía registrado'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_amount IS NOT NULL AND (p_amount < 0 OR p_amount > v_deposit + 0.01) THEN
    RAISE EXCEPTION 'El monto no puede exceder el depósito registrado (%).', v_deposit
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.contracts
     SET deposit_status = p_status,
         deposit_settled_at = CASE WHEN p_status = 'held' THEN NULL ELSE now() END,
         deposit_settled_amount = CASE WHEN p_status = 'held' THEN NULL ELSE COALESCE(p_amount, v_deposit) END,
         deposit_notes = p_notes,
         updated_at = now()
   WHERE id = p_contract_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_contract_deposit_status(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_contract_deposit_status(uuid, text, numeric, text) TO authenticated;

-- A4B-05: restaurar (desarchivar) clientes y proveedores
CREATE OR REPLACE FUNCTION public.restore_customer(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.customers
     SET deleted_at = NULL, updated_at = now()
   WHERE id = p_customer_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El cliente no existe o no está archivado' USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_supplier(p_supplier_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.suppliers
     SET deleted_at = NULL, updated_at = now()
   WHERE id = p_supplier_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El proveedor no existe o no está archivado' USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_supplier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_supplier(uuid) TO authenticated;