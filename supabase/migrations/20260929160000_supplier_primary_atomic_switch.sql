-- Serialize supplier primary-contact/bank-account switches by locking the parent supplier.
-- Each form save (insert or update) and its primary transition succeeds or rolls back as one transaction.
CREATE OR REPLACE FUNCTION public.save_supplier_bank_account(
  p_supplier_id uuid,
  p_account_id uuid,
  p_bank_name text,
  p_account_holder text,
  p_clabe text,
  p_account_number text,
  p_currency text,
  p_notes text,
  p_is_primary boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_account_id uuid;
BEGIN
  IF NOT (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_supplier_id IS NULL OR p_is_primary IS NULL THEN
    RAISE EXCEPTION 'El proveedor y el estado de cuenta primaria son obligatorios'
      USING ERRCODE = '22004';
  END IF;

  -- Concurrent saves for the same supplier queue here, preventing two callers
  -- from demoting/promoting primaries against the same stale state.
  PERFORM 1
    FROM public.suppliers
   WHERE id = p_supplier_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF p_account_id IS NULL THEN
    IF p_is_primary THEN
      UPDATE public.supplier_bank_accounts
         SET is_primary = false
       WHERE supplier_id = p_supplier_id
         AND is_primary;
    END IF;

    INSERT INTO public.supplier_bank_accounts (
      supplier_id, bank_name, account_holder, clabe, account_number,
      currency, notes, is_primary
    )
    VALUES (
      p_supplier_id, p_bank_name, p_account_holder, p_clabe, p_account_number,
      p_currency, p_notes, p_is_primary
    )
    RETURNING id INTO v_account_id;

    RETURN v_account_id;
  END IF;

  PERFORM 1
    FROM public.supplier_bank_accounts
   WHERE id = p_account_id
     AND supplier_id = p_supplier_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta bancaria no pertenece al proveedor'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_is_primary THEN
    UPDATE public.supplier_bank_accounts
       SET is_primary = false
     WHERE supplier_id = p_supplier_id
       AND is_primary
       AND id <> p_account_id;
  END IF;

  UPDATE public.supplier_bank_accounts
     SET bank_name = p_bank_name,
         account_holder = p_account_holder,
         clabe = p_clabe,
         account_number = p_account_number,
         currency = p_currency,
         notes = p_notes,
         is_primary = p_is_primary
   WHERE id = p_account_id
     AND supplier_id = p_supplier_id;

  RETURN p_account_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_supplier_bank_account(uuid, uuid, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_supplier_bank_account(uuid, uuid, text, text, text, text, text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_supplier_contact(
  p_supplier_id uuid,
  p_contact_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_role text,
  p_notes text,
  p_is_primary boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_contact_id uuid;
BEGIN
  IF NOT (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF p_supplier_id IS NULL OR p_is_primary IS NULL THEN
    RAISE EXCEPTION 'El proveedor y el estado de contacto primario son obligatorios'
      USING ERRCODE = '22004';
  END IF;

  PERFORM 1
    FROM public.suppliers
   WHERE id = p_supplier_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF p_contact_id IS NULL THEN
    IF p_is_primary THEN
      UPDATE public.supplier_contacts
         SET is_primary = false
       WHERE supplier_id = p_supplier_id
         AND is_primary;
    END IF;

    INSERT INTO public.supplier_contacts (
      supplier_id, name, email, phone, role, notes, is_primary
    )
    VALUES (
      p_supplier_id, p_name, p_email, p_phone, p_role, p_notes, p_is_primary
    )
    RETURNING id INTO v_contact_id;

    RETURN v_contact_id;
  END IF;

  PERFORM 1
    FROM public.supplier_contacts
   WHERE id = p_contact_id
     AND supplier_id = p_supplier_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contacto no pertenece al proveedor'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_is_primary THEN
    UPDATE public.supplier_contacts
       SET is_primary = false
     WHERE supplier_id = p_supplier_id
       AND is_primary
       AND id <> p_contact_id;
  END IF;

  UPDATE public.supplier_contacts
     SET name = p_name,
         email = p_email,
         phone = p_phone,
         role = p_role,
         notes = p_notes,
         is_primary = p_is_primary
   WHERE id = p_contact_id
     AND supplier_id = p_supplier_id;

  RETURN p_contact_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_supplier_contact(uuid, uuid, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_supplier_contact(uuid, uuid, text, text, text, text, text, boolean) TO authenticated, service_role;
