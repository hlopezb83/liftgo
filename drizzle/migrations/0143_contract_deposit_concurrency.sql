-- Install both definitions in one migration transaction. Old clients fail
-- closed until they reload; there is no unversioned compatibility write path.
CREATE OR REPLACE FUNCTION public.set_contract_deposit_status_checked(
  p_contract_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_deposit numeric;
  v_next_settled_at timestamptz;
  v_next_amount numeric;
BEGIN
  IF NOT (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'Se requiere la revisión del depósito. Recarga la aplicación.'
      USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('held', 'applied', 'returned') THEN
    RAISE EXCEPTION 'Estado de depósito inválido: %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_contract FROM public.contracts
   WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado';
  END IF;
  -- Compare after acquiring the row lock, including when the requested values
  -- happen to equal the latest values. Never silently approve a stale draft.
  IF v_contract.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'El contrato cambió. Recarga el depósito antes de guardar.'
      USING ERRCODE = '40001';
  END IF;

  v_deposit := COALESCE(v_contract.deposit_amount, 0);
  IF p_status <> 'held' AND v_deposit <= 0 THEN
    RAISE EXCEPTION 'El contrato no tiene depósito en garantía registrado'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount IS NOT NULL AND (p_amount < 0 OR p_amount > v_deposit + 0.01) THEN
    RAISE EXCEPTION 'El monto no puede exceder el depósito registrado (%).', v_deposit
      USING ERRCODE = 'check_violation';
  END IF;

  v_next_amount := CASE WHEN p_status = 'held' THEN NULL
                        ELSE COALESCE(p_amount, v_contract.deposit_settled_amount, v_deposit) END;
  v_next_settled_at := CASE WHEN p_status = 'held' THEN NULL
                            WHEN p_status IS DISTINCT FROM v_contract.deposit_status THEN now()
                            ELSE v_contract.deposit_settled_at END;
  IF p_status IS DISTINCT FROM v_contract.deposit_status
     OR v_next_amount IS DISTINCT FROM v_contract.deposit_settled_amount
     OR v_next_settled_at IS DISTINCT FROM v_contract.deposit_settled_at
     OR p_notes IS DISTINCT FROM v_contract.deposit_notes THEN
    UPDATE public.contracts
       SET deposit_status = p_status,
           deposit_settled_at = v_next_settled_at,
           deposit_settled_amount = v_next_amount,
           deposit_notes = p_notes,
           updated_at = now()
     WHERE id = p_contract_id
     RETURNING * INTO v_contract;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se pudo actualizar el depósito' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'updated_at', v_contract.updated_at,
    'deposit_amount', v_contract.deposit_amount,
    'deposit_status', v_contract.deposit_status,
    'deposit_settled_at', v_contract.deposit_settled_at,
    'deposit_settled_amount', v_contract.deposit_settled_amount,
    'deposit_notes', v_contract.deposit_notes
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_contract_deposit_status(
  p_contract_id uuid, p_status text, p_amount numeric DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  RAISE EXCEPTION 'Esta versión no puede guardar depósitos. Recarga la aplicación e intenta de nuevo.'
    USING ERRCODE = 'P0001';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_contract_deposit_status_checked(uuid, timestamptz, text, numeric, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_contract_deposit_status_checked(uuid, timestamptz, text, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_contract_deposit_status(uuid, text, numeric, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_contract_deposit_status(uuid, text, numeric, text) TO authenticated;
COMMENT ON FUNCTION public.set_contract_deposit_status_checked(uuid, timestamptz, text, numeric, text) IS
  'Updates a deposit only if the draft revision matches the locked contract; returns the confirmed deposit snapshot.';
COMMENT ON FUNCTION public.set_contract_deposit_status(uuid, text, numeric, text) IS
  'Retired unversioned endpoint. Always rejects writes so old tabs must reload.';
NOTIFY pgrst, 'reload schema';
