-- =====================================================================
-- Multi-organización · Fase 0.1
-- Corrige la coherencia entre una cuenta de portal y su membresía.
--
-- Invariante: una cuenta de portal exige una membresía `portal` de la
-- misma organización. `auth_user_id` sigue siendo único global, por lo que
-- ninguna cuenta puede pertenecer a dos organizaciones.
-- =====================================================================

-- El backfill de la fase 0 creó membresías desde profiles antes de insertar
-- las cuentas de portal. En instalaciones donde el trigger de auth también
-- crea profile para clientes, esa secuencia dejó al cliente como `internal`.
-- No se modifica ninguna cuenta que no tenga rol customer: esa combinación
-- es inconsistente y debe corregirse explícitamente, no reinterpretarse.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.customer_portal_accounts a
    LEFT JOIN public.user_roles r ON r.user_id = a.auth_user_id
    WHERE r.role IS DISTINCT FROM 'customer'::public.app_role
  ) THEN
    RAISE EXCEPTION
      'No se puede normalizar customer_portal_accounts con usuarios que no tienen rol customer'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

UPDATE public.organization_memberships m
SET member_type = 'portal',
    updated_at = now()
WHERE m.member_type <> 'portal'
  AND EXISTS (
    SELECT 1
    FROM public.customer_portal_accounts a
    WHERE a.auth_user_id = m.auth_user_id
      AND a.organization_id = m.organization_id
  );

-- Una alta de portal puede llegar después de que auth creó un profile. Si ese
-- usuario solo tiene rol customer, se convierte la membresía heredada a
-- portal; si ya es staff, se bloquea para exigir otra cuenta/correo.
CREATE OR REPLACE FUNCTION public.enforce_portal_account_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.organization_memberships%ROWTYPE;
  v_is_staff boolean;
BEGIN
  SELECT *
  INTO v_membership
  FROM public.organization_memberships
  WHERE auth_user_id = NEW.auth_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.organization_memberships (
      organization_id,
      auth_user_id,
      member_type
    )
    VALUES (NEW.organization_id, NEW.auth_user_id, 'portal');
  ELSIF v_membership.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION
      'El usuario ya pertenece a otra organización; usa un correo distinto para esta organización'
      USING ERRCODE = '23505';
  ELSIF v_membership.member_type <> 'portal' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles r
      WHERE r.user_id = NEW.auth_user_id
        AND r.role <> 'customer'::public.app_role
    )
    INTO v_is_staff;

    IF v_is_staff THEN
      RAISE EXCEPTION
        'Un usuario interno no puede reutilizarse como cuenta de portal; usa un correo distinto'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.organization_memberships
    SET member_type = 'portal',
        updated_at = now()
    WHERE id = v_membership.id;
  END IF;

  RETURN NEW;
END;
$$;

-- La protección debe ser simétrica: ni siquiera service code puede mover una
-- membresía de portal a otro tipo u organización dejando la cuenta desfasada.
CREATE OR REPLACE FUNCTION public.enforce_membership_portal_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_org uuid;
BEGIN
  SELECT organization_id
  INTO v_portal_org
  FROM public.customer_portal_accounts
  WHERE auth_user_id = NEW.auth_user_id;

  IF FOUND
     AND (
       NEW.member_type <> 'portal'
       OR NEW.organization_id IS DISTINCT FROM v_portal_org
     ) THEN
    RAISE EXCEPTION
      'La membresía de una cuenta de portal debe ser de tipo portal y pertenecer a la misma organización'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_portal_account
  ON public.organization_memberships;

CREATE TRIGGER trg_membership_portal_account
  BEFORE INSERT OR UPDATE OF organization_id, auth_user_id, member_type
  ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_membership_portal_account();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.customer_portal_accounts a
    LEFT JOIN public.organization_memberships m
      ON m.auth_user_id = a.auth_user_id
    WHERE m.id IS NULL
       OR m.member_type <> 'portal'
       OR m.organization_id IS DISTINCT FROM a.organization_id
  ) THEN
    RAISE EXCEPTION
      'Quedó una cuenta de portal sin membresía portal coherente'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
