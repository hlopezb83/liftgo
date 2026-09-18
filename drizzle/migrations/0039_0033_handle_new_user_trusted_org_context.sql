-- 0033 · El contexto de empresa del alta de usuarios deja de leerse de
-- `raw_user_meta_data` (dato que el propio usuario puede modificar).
--
-- Hallazgo: `handle_new_user` (0030) tomaba
-- `NEW.raw_user_meta_data->>'organization_id'` y lo fijaba como
-- `app.organization_id` de la transacción. `user_metadata` es escribible por
-- el propio usuario (`auth.signUp(..., { data })` y `auth.updateUser`), así
-- que una cuenta podía declarar la empresa bajo la que se auditaba su alta.
--
-- Cierre: el contexto sólo se acepta desde `raw_app_meta_data`, que únicamente
-- puede escribir el service role (Auth Admin API). Cualquier valor en
-- `raw_user_meta_data` se IGNORA por completo para decidir empresa/contexto;
-- `full_name` se sigue leyendo de ahí porque es un dato descriptivo, no una
-- decisión de autorización ni de atribución.
--
-- No se crea ninguna membresía aquí: la membresía la sigue creando el flujo
-- verificado del servidor (invitación interna, portal, primer administrador).
-- Forward-only. Sin cambios de permisos ni de producto.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- SOLO app_metadata: canal server-only (service role / Auth Admin API).
  v_org_text text := NULLIF(btrim(coalesce(NEW.raw_app_meta_data->>'organization_id', '')), '');
  v_org uuid;
BEGIN
  IF v_org_text IS NOT NULL
     AND v_org_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT o.id INTO v_org FROM public.organizations o WHERE o.id = v_org_text::uuid;
    IF v_org IS NOT NULL THEN
      PERFORM set_config('app.organization_id', v_org::text, true);
    END IF;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Alta de usuario: perfil + rol base. El contexto de organizacion se toma UNICAMENTE de raw_app_meta_data (service role); raw_user_meta_data nunca decide empresa. No crea membresias.';

-- Verificación fail-closed de la propia migración: el cuerpo instalado no
-- puede volver a leer la organización desde los metadatos del usuario.
DO $verify$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';

  IF v_src IS NULL THEN
    RAISE EXCEPTION '0033: no existe public.handle_new_user()';
  END IF;
  IF v_src LIKE '%raw_user_meta_data->>''organization_id''%' THEN
    RAISE EXCEPTION '0033: handle_new_user sigue leyendo organization_id de raw_user_meta_data';
  END IF;
  IF v_src NOT LIKE '%raw_app_meta_data->>''organization_id''%' THEN
    RAISE EXCEPTION '0033: handle_new_user no toma el contexto de raw_app_meta_data';
  END IF;
END
$verify$;