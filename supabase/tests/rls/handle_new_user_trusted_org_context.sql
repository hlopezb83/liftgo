-- Multiempresa · Tramo 12 (migración 0033):
-- `handle_new_user` NO debe tomar la empresa de `raw_user_meta_data`
-- (dato escribible por el propio usuario vía signUp/updateUser).
--
-- Contrato verificado con DOS empresas (A inicial, B creada por el canal de
-- plataforma):
--   0) El cuerpo instalado de handle_new_user sólo lee raw_app_meta_data.
--   1) Falsificación: un alta cuyo raw_user_meta_data declara la empresa B
--      NO cambia el contexto (app.organization_id) ni atribuye escrituras ni
--      filas de audit_logs a B.
--   2) Canal confiable: el alta con raw_app_meta_data.organization_id = B sí
--      fija el contexto y las filas de auditoría quedan en B.
--   3) La empresa B pendiente completa su alta después de la falsificación,
--      sin debilitar los guards de plataforma.
BEGIN;

-- ── 0. El cuerpo instalado ignora user_metadata ──────────────────────
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'CTX: no existe public.handle_new_user()';
  END IF;
  IF v_src LIKE '%raw_user_meta_data->>''organization_id''%' THEN
    RAISE EXCEPTION 'CTX: handle_new_user lee organization_id de raw_user_meta_data';
  END IF;
  IF v_src NOT LIKE '%raw_app_meta_data->>''organization_id''%' THEN
    RAISE EXCEPTION 'CTX: handle_new_user no usa raw_app_meta_data';
  END IF;
  RAISE NOTICE 'OK: handle_new_user sólo acepta el contexto server-only';
END;
$$;

-- ── 1. Base: empresa A, operador de plataforma y empresa B pendiente ─
DO $$
DECLARE
  v_org_a uuid;
  v_oper  uuid := '3a000000-0000-4000-8000-0000000000a1';
  v_org_b uuid;
BEGIN
  SELECT id INTO v_org_a
  FROM public.organizations WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_org_a IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;
  PERFORM set_config('app.ctx.org_a', v_org_a::text, true);
  PERFORM set_config('app.organization_id', v_org_a::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_oper, 'operador-ctx@trusted.test', now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_a, v_oper, 'internal');
  INSERT INTO public.profiles (user_id, full_name, is_active)
  VALUES (v_oper, 'Operador CTX', true)
  ON CONFLICT (user_id) DO UPDATE SET is_active = true;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_oper, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.platform_operators (auth_user_id, notes)
  VALUES (v_oper, 'prueba contexto confiable')
  ON CONFLICT (auth_user_id) DO NOTHING;

  v_org_b := public.platform_create_organization(v_oper, 'Empresa B Contexto', 'ctx-empresa-b');
  PERFORM set_config('app.ctx.org_b', v_org_b::text, true);
END;
$$;

-- ── 2. Falsificación de raw_user_meta_data hacia la empresa B ────────
DO $$
DECLARE
  v_org_a uuid := current_setting('app.ctx.org_a')::uuid;
  v_org_b uuid := current_setting('app.ctx.org_b')::uuid;
  v_fake  uuid := '3a000000-0000-4000-8000-0000000000f1';
  v_ctx   text;
  v_audit integer;
BEGIN
  -- Contexto legítimo de la sesión: empresa A.
  PERFORM set_config('app.organization_id', v_org_a::text, true);

  -- El usuario declara la empresa B en SUS metadatos (vector auditado).
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (v_fake, 'falsificador@trusted.test',
          jsonb_build_object('full_name', 'Falsificador',
                             'organization_id', v_org_b::text),
          '{}'::jsonb,
          now(), now());

  -- El contexto de la transacción sigue siendo A: el trigger no lo movió.
  v_ctx := NULLIF(current_setting('app.organization_id', true), '');
  IF v_ctx IS DISTINCT FROM v_org_a::text THEN
    RAISE EXCEPTION 'CTX: raw_user_meta_data cambió el contexto de empresa (%)', v_ctx;
  END IF;

  -- Ninguna fila de auditoría del alta quedó atribuida a la empresa B.
  SELECT count(*) INTO v_audit
  FROM public.audit_logs
  WHERE organization_id = v_org_b
    AND (record_id = v_fake OR new_data::text LIKE '%' || v_fake::text || '%');
  IF v_audit > 0 THEN
    RAISE EXCEPTION 'CTX: % filas de audit_logs se atribuyeron a la empresa falsificada', v_audit;
  END IF;

  -- Tampoco se creó membresía alguna (menos aún en B).
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE auth_user_id = v_fake) THEN
    RAISE EXCEPTION 'CTX: el alta falsificada obtuvo membresía';
  END IF;

  RAISE NOTICE 'OK: los metadatos del usuario no deciden empresa ni atribución';
END;
$$;

-- ── 3. Canal confiable (app_metadata) y cierre del alta pendiente ────
DO $$
DECLARE
  v_org_a   uuid := current_setting('app.ctx.org_a')::uuid;
  v_org_b   uuid := current_setting('app.ctx.org_b')::uuid;
  v_oper    uuid := '3a000000-0000-4000-8000-0000000000a1';
  v_admin_b uuid := '3a000000-0000-4000-8000-0000000000b1';
BEGIN
  PERFORM set_config('app.organization_id', v_org_a::text, true);

  -- Service role: la empresa viaja en app_metadata. Aquí el usuario también
  -- miente en user_metadata; debe ganar el canal confiable.
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (v_admin_b, 'admin-b@trusted.test',
          jsonb_build_object('full_name', 'Admin B',
                             'organization_id', v_org_a::text),
          jsonb_build_object('organization_id', v_org_b::text),
          now(), now());

  IF current_setting('app.organization_id', true) IS DISTINCT FROM v_org_b::text THEN
    RAISE EXCEPTION 'CTX: app_metadata no fijó el contexto de la empresa B';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_admin_b) THEN
    RAISE EXCEPTION 'CTX: no se creó el perfil del primer administrador de B';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE auth_user_id = v_admin_b) THEN
    RAISE EXCEPTION 'CTX: handle_new_user no debe crear membresías';
  END IF;

  -- El alta pendiente se completa por el canal verificado y activa la empresa.
  PERFORM public.platform_attach_first_admin(v_oper, v_org_b, v_admin_b);

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = v_org_b AND auth_user_id = v_admin_b AND member_type = 'internal'
  ) THEN
    RAISE EXCEPTION 'CTX: falta la membresía interna del primer administrador de B';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org_b AND is_active) THEN
    RAISE EXCEPTION 'CTX: la empresa B no quedó activa tras adjuntar a su administrador';
  END IF;

  -- El usuario falsificador sigue sin pertenecer a ninguna empresa.
  IF EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE auth_user_id = '3a000000-0000-4000-8000-0000000000f1'
  ) THEN
    RAISE EXCEPTION 'CTX: el alta falsificada terminó con membresía';
  END IF;

  RAISE NOTICE 'OK: el canal server-only fija el contexto y el alta pendiente se completa';
END;
$$;

ROLLBACK;
