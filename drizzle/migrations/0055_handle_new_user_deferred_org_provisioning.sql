-- Difiere el aprovisionamiento de auth.users hasta que GoTrue aplique
-- app_metadata.organization_id (admin.createUser inserta y luego actualiza).
-- Fail-closed: org inválida/inactiva => 23514; nunca user_metadata ni inferencia.
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

  SELECT o.id INTO v_org FROM public.organizations o
  WHERE o.id = v_org_text::uuid AND o.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'organization_id inexistente o inactiva en app_metadata' USING ERRCODE = '23514';
  END IF;

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

DROP TRIGGER IF EXISTS on_auth_user_app_metadata_updated ON auth.users;
CREATE TRIGGER on_auth_user_app_metadata_updated
  AFTER UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();