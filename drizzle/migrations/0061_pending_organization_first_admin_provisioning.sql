-- A first administrator is created while platform onboarding keeps the new
-- organization inactive. 0055 accidentally rejected that trusted auth user,
-- making platform_attach_first_admin impossible. A suspended organization
-- with an existing internal member remains closed to new account provisioning.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_text text := NULLIF(btrim(coalesce(NEW.raw_app_meta_data->>'organization_id', '')), '');
  v_org uuid;
BEGIN
  IF v_org_text IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NULLIF(btrim(coalesce(OLD.raw_app_meta_data->>'organization_id', '')), '') IS NOT DISTINCT FROM v_org_text
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF v_org_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'organization_id inválido en app_metadata' USING ERRCODE = '23514';
  END IF;

  SELECT o.id INTO v_org
  FROM public.organizations o
  WHERE o.id = v_org_text::uuid
    AND (
      o.is_active
      OR NOT EXISTS (
        SELECT 1 FROM public.organization_memberships m
        WHERE m.organization_id = o.id AND m.member_type = 'internal'
      )
    );
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'organization_id inexistente o inactiva en app_metadata' USING ERRCODE = '23514';
  END IF;

  -- Context is still taken exclusively from server-controlled app_metadata.
  -- This creates no membership; an inactive company remains inaccessible until
  -- platform_attach_first_admin verifies the operator and activates it.
  PERFORM set_config('app.organization_id', v_org::text, true);

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Provisiona perfiles sólo desde app_metadata validado. Permite la primera cuenta de una empresa pendiente sin crear membresía; rechaza empresas suspendidas con miembros internos.';
