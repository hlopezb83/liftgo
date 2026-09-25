-- A note edit or repeated save must not turn a partial settlement into a full
-- settlement or rewrite the date on which the deposit was applied/returned.
-- Keep SECURITY INVOKER so the existing contract RLS limits the target org.
CREATE OR REPLACE FUNCTION public.set_contract_deposit_status(
  p_contract_id uuid,
  p_status text,
  p_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_deposit numeric;
  v_current text;
  v_settled_at timestamptz;
  v_settled_amount numeric;
  v_notes text;
  v_next_settled_at timestamptz;
  v_next_amount numeric;
BEGIN
  IF NOT (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('held', 'applied', 'returned') THEN
    RAISE EXCEPTION 'Estado de depósito inválido: %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(deposit_amount, 0), deposit_status,
         deposit_settled_at, deposit_settled_amount, deposit_notes
    INTO v_deposit, v_current, v_settled_at, v_settled_amount, v_notes
    FROM public.contracts
   WHERE id = p_contract_id
   FOR UPDATE;

  IF NOT FOUND THEN
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

  v_next_amount := CASE WHEN p_status = 'held' THEN NULL
                        ELSE COALESCE(p_amount, v_settled_amount, v_deposit) END;
  v_next_settled_at := CASE WHEN p_status = 'held' THEN NULL
                            WHEN p_status IS DISTINCT FROM v_current THEN now()
                            ELSE v_settled_at END;

  IF p_status IS NOT DISTINCT FROM v_current
     AND v_next_amount IS NOT DISTINCT FROM v_settled_amount
     AND v_next_settled_at IS NOT DISTINCT FROM v_settled_at
     AND p_notes IS NOT DISTINCT FROM v_notes THEN
    RETURN;
  END IF;

  UPDATE public.contracts
     SET deposit_status = p_status,
         deposit_settled_at = v_next_settled_at,
         deposit_settled_amount = v_next_amount,
         deposit_notes = p_notes,
         updated_at = now()
   WHERE id = p_contract_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_contract_deposit_status(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_contract_deposit_status(uuid, text, numeric, text) TO authenticated;
