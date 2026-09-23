-- Multiempresa · Tramo 9: cierre funcional (migración 0030).
--
-- Contrato verificado con DOS empresas reales (A = organización inicial,
-- B = creada aquí mediante las funciones de plataforma):
--   0) Catálogo: tabla platform_operators (RLS + policy), columna
--      customers.created_by_organization_id, funciones y ACL (anon y
--      authenticated NO ejecutan las funciones de plataforma).
--   1) Alta de B: sólo un operador de plataforma verificado crea la empresa;
--      el alta del primer administrador es atómica (membresía + rol admin);
--      un segundo "primer administrador" se rechaza.
--   2) handle_new_user: con varias empresas activas, el alta en auth.users
--      con metadatos organization_id crea perfil/rol sin error de contexto.
--   3) Clientes por empresa: A y B sólo ven/modifican sus propios clientes;
--      RFC global único → vínculo por RFC crea la relación en B; archivado de
--      un cliente compartido es por relación; archivado del único dueño sigue
--      siendo global.
--   4) Portal por empresa: la cuenta de portal de B es invisible para A.
--   5) Suspensión: el administrador de empresa no puede cambiar is_active; el
--      operador sí; con B suspendida sus miembros no leen ni escriben.
BEGIN;

-- ── 0. Catálogo tras 0030 ────────────────────────────────────────────
DO $$
DECLARE
  v_fallas text[] := '{}';
  v_fn text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'platform_operators'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    v_fallas := v_fallas || 'platform_operators sin RLS forzada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'platform_operators'
  ) THEN
    v_fallas := v_fallas || 'platform_operators sin policies';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'created_by_organization_id'
  ) THEN
    v_fallas := v_fallas || 'customers.created_by_organization_id ausente';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.platform_create_organization(uuid, text, text)',
    'public.platform_attach_first_admin(uuid, uuid, uuid)',
    'public.platform_discard_organization(uuid, uuid)',
    'public.platform_set_organization_active(uuid, uuid, boolean)',
    'public.platform_list_organizations(uuid)',
    'public.assert_platform_operator(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      v_fallas := v_fallas || (v_fn || ' -> ejecutable por anon/authenticated');
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      v_fallas := v_fallas || (v_fn || ' -> service_role sin EXECUTE');
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.link_customer_to_organization_by_rfc(text, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_platform_operator()', 'EXECUTE') THEN
    v_fallas := v_fallas || 'funciones de cliente/operador ejecutables por anon';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'ONBOARDING 0030: catálogo inesperado:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
  RAISE NOTICE 'OK: catálogo 0030 (tabla, columna, funciones y ACL)';
END;
$$;

-- ── 1. Base: empresa A con un operador y un administrador NO operador ─
DO $$
DECLARE
  v_org_a uuid;
  v_oper_a uuid := '30000000-0000-4000-8000-0000000000a1';
  v_admin_a2 uuid := '30000000-0000-4000-8000-0000000000a2';
BEGIN
  SELECT id INTO v_org_a
  FROM public.organizations WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_org_a IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;
  PERFORM set_config('app.onb.org_a', v_org_a::text, true);
  PERFORM set_config('app.organization_id', v_org_a::text, true);

  INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
    (v_oper_a, 'operador-a@onboarding.test', now(), now()),
    (v_admin_a2, 'admin-a2@onboarding.test', now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
    (v_org_a, v_oper_a, 'internal'),
    (v_org_a, v_admin_a2, 'internal');

  INSERT INTO public.profiles (user_id, full_name, is_active) VALUES
    (v_oper_a, 'Operador A', true),
    (v_admin_a2, 'Admin A2', true)
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, is_active = true;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_oper_a, 'admin'::public.app_role),
    (v_admin_a2, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.platform_operators (auth_user_id, notes)
  VALUES (v_oper_a, 'prueba onboarding')
  ON CONFLICT (auth_user_id) DO NOTHING;
END;
$$;

-- ── 2. Alta de B mediante el canal de plataforma ─────────────────────
-- Las funciones son SECURITY DEFINER y su ACL (sólo service_role) ya se
-- verificó en la sección 0; aquí se ejecutan con la sesión de la suite
-- (sin JWT → auth.uid() IS NULL, como desde el servidor).

DO $$
DECLARE
  v_org_a uuid := current_setting('app.onb.org_a')::uuid;
  v_oper_a uuid := '30000000-0000-4000-8000-0000000000a1';
  v_admin_a2 uuid := '30000000-0000-4000-8000-0000000000a2';
  v_admin_b uuid := '30000000-0000-4000-8000-0000000000b1';
  v_org_b uuid;
  v_tmp uuid;
  v_rows integer;
BEGIN
  -- Un administrador de empresa que NO es operador no crea empresas.
  BEGIN
    v_tmp := public.platform_create_organization(v_admin_a2, 'Empresa intrusa', 'intrusa-b');
    RAISE EXCEPTION 'ONBOARDING: un administrador sin rol de operador creó una empresa';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Slug inválido y nombre corto se rechazan.
  BEGIN
    v_tmp := public.platform_create_organization(v_oper_a, 'Empresa B', 'Slug Inválido');
    RAISE EXCEPTION 'ONBOARDING: se aceptó un slug inválido';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  v_org_b := public.platform_create_organization(v_oper_a, '  Empresa B Onboarding ', 'onboarding-b');
  IF v_org_b IS NULL THEN
    RAISE EXCEPTION 'ONBOARDING: platform_create_organization no devolvió id';
  END IF;
  PERFORM set_config('app.onb.org_b', v_org_b::text, true);

  -- Migración 0031: la empresa nace INACTIVA (pending) y sólo se activa al
  -- adjuntar a su primer administrador dentro de la misma transacción.
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = v_org_b AND NOT is_active AND name = 'Empresa B Onboarding'
  ) THEN
    RAISE EXCEPTION 'ONBOARDING: la empresa B no quedó pendiente con el nombre normalizado';
  END IF;


  -- Con DOS empresas activas, el alta en auth.users con metadatos de
  -- organización crea perfil y rol (auditoría con contexto) sin 23514.
  PERFORM set_config('app.organization_id', '', true);
  -- 0033: el contexto viaja en app_metadata (service role), no en user_metadata.
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (v_admin_b, 'admin-b@onboarding.test',
          jsonb_build_object('full_name', 'Admin B'),
          jsonb_build_object('organization_id', v_org_b::text),
          now(), now());

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_admin_b) THEN
    RAISE EXCEPTION 'ONBOARDING: handle_new_user no creó el perfil del primer administrador';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE auth_user_id = v_admin_b) THEN
    RAISE EXCEPTION 'ONBOARDING: handle_new_user no debe crear membresías';
  END IF;

  -- Adjuntar al primer administrador sólo lo hace un operador.
  BEGIN
    PERFORM public.platform_attach_first_admin(v_admin_a2, v_org_b, v_admin_b);
    RAISE EXCEPTION 'ONBOARDING: un no operador adjuntó al primer administrador';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM public.platform_attach_first_admin(v_oper_a, v_org_b, v_admin_b);

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = v_org_b AND auth_user_id = v_admin_b AND member_type = 'internal'
  ) THEN
    RAISE EXCEPTION 'ONBOARDING: falta la membresía interna del primer administrador de B';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_admin_b AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'ONBOARDING: el primer administrador de B no tiene rol admin';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE table_name = 'organizations' AND record_id = v_org_b AND organization_id = v_org_b
  ) THEN
    RAISE EXCEPTION 'ONBOARDING: el alta de B no dejó rastro de auditoría atribuido a B';
  END IF;

  -- Un segundo "primer administrador" se rechaza (usar invitación normal).
  BEGIN
    PERFORM public.platform_attach_first_admin(v_oper_a, v_org_b, v_admin_a2);
    RAISE EXCEPTION 'ONBOARDING: se adjuntó un segundo primer administrador';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- La lista de plataforma incluye a B con un miembro interno.
  SELECT count(*) INTO v_rows
  FROM public.platform_list_organizations(v_oper_a) l
  WHERE l.id = v_org_b AND l.internal_members = 1 AND l.is_active;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ONBOARDING: platform_list_organizations no refleja a B (filas=%)', v_rows;
  END IF;

  -- Descartar una empresa con miembros está prohibido; una vacía se elimina.
  BEGIN
    PERFORM public.platform_discard_organization(v_oper_a, v_org_b);
    RAISE EXCEPTION 'ONBOARDING: se descartó una empresa con miembros';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  v_tmp := public.platform_create_organization(v_oper_a, 'Empresa efímera', 'efimera-c');
  IF NOT public.platform_discard_organization(v_oper_a, v_tmp) THEN
    RAISE EXCEPTION 'ONBOARDING: no se pudo descartar una empresa vacía';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = v_tmp) THEN
    RAISE EXCEPTION 'ONBOARDING: la empresa efímera sigue presente';
  END IF;

  RAISE NOTICE 'OK: alta de B con operador verificado, primer administrador atómico y compensación';
END;
$$;

-- ── 3a. Clientes: el administrador de A da de alta a su cliente ──────
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"30000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

DO $$
DECLARE
  v_org_a uuid := current_setting('app.onb.org_a')::uuid;
  v_cust_a1 uuid := '30000000-0000-4000-8000-0000000000c1';
  v_cust_a2 uuid := '30000000-0000-4000-8000-0000000000c2';
  v_owner uuid;
BEGIN
  IF public.current_organization_id() IS DISTINCT FROM v_org_a THEN
    RAISE EXCEPTION 'CONTEXTO: el admin de A no resuelve la organización A';
  END IF;
  IF public.is_platform_operator() THEN
    RAISE EXCEPTION 'OPERADOR: admin A2 no debe figurar como operador';
  END IF;

  INSERT INTO public.customers (id, name, rfc) VALUES
    (v_cust_a1, 'Cliente compartido A', 'AAA010101AA1'),
    (v_cust_a2, 'Cliente exclusivo A', 'AAA010101AA2');

  SELECT created_by_organization_id INTO v_owner FROM public.customers WHERE id = v_cust_a1;
  IF v_owner IS DISTINCT FROM v_org_a THEN
    RAISE EXCEPTION 'CLIENTES: created_by_organization_id no se fijó a la empresa del usuario';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_customers
    WHERE organization_id = v_org_a AND customer_id = v_cust_a1 AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'CLIENTES: no se creó la relación comercial automática en A';
  END IF;

  -- Un usuario no puede adjudicar el alta a otra empresa.
  BEGIN
    INSERT INTO public.customers (name, created_by_organization_id)
    VALUES ('Intento cruzado', current_setting('app.onb.org_b')::uuid);
    RAISE EXCEPTION 'CLIENTES: A dio de alta un cliente a nombre de B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  RAISE NOTICE 'OK: alta de clientes en A con dueño y relación automática';
END;
$$;

-- ── 3b. Clientes: B no ve a los de A; vínculo por RFC; archivado ─────
RESET request.jwt.claims;
SET LOCAL request.jwt.claims TO
  '{"sub":"30000000-0000-4000-8000-0000000000b1","role":"authenticated"}';

DO $$
DECLARE
  v_org_b uuid := current_setting('app.onb.org_b')::uuid;
  v_cust_a1 uuid := '30000000-0000-4000-8000-0000000000c1';
  v_cust_a2 uuid := '30000000-0000-4000-8000-0000000000c2';
  v_cust_b1 uuid := '30000000-0000-4000-8000-0000000000c3';
  v_linked uuid;
  v_n integer;
BEGIN
  IF public.current_organization_id() IS DISTINCT FROM v_org_b THEN
    RAISE EXCEPTION 'CONTEXTO: el admin de B no resuelve la organización B';
  END IF;

  SELECT count(*) INTO v_n FROM public.customers WHERE id IN (v_cust_a1, v_cust_a2);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'AISLAMIENTO: B ve % clientes de A (esperado 0)', v_n;
  END IF;

  WITH tocadas AS (
    UPDATE public.customers SET name = 'INTENTO CRUZADO' WHERE id = v_cust_a1 RETURNING 1
  ) SELECT count(*) INTO v_n FROM tocadas;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'AISLAMIENTO: B modificó un cliente de A';
  END IF;

  INSERT INTO public.customers (id, name, rfc) VALUES (v_cust_b1, 'Cliente propio B', 'BBB010101BB1');
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_customers
    WHERE organization_id = v_org_b AND customer_id = v_cust_b1
  ) THEN
    RAISE EXCEPTION 'CLIENTES: no se creó la relación comercial automática en B';
  END IF;

  -- RFC global único: crear un duplicado falla; vincular por RFC crea la relación.
  BEGIN
    INSERT INTO public.customers (name, rfc) VALUES ('Duplicado RFC', 'AAA010101AA1');
    RAISE EXCEPTION 'CLIENTES: se aceptó un RFC duplicado (la identidad debe ser global)';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  v_linked := public.link_customer_to_organization_by_rfc('aaa010101aa1', 'Alias en B');
  IF v_linked IS DISTINCT FROM v_cust_a1 THEN
    RAISE EXCEPTION 'CLIENTES: el vínculo por RFC no devolvió al cliente compartido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_customers
    WHERE organization_id = v_org_b AND customer_id = v_cust_a1 AND status = 'active' AND alias = 'Alias en B'
  ) THEN
    RAISE EXCEPTION 'CLIENTES: falta la relación de B con el cliente compartido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_cust_a1) THEN
    RAISE EXCEPTION 'CLIENTES: B sigue sin ver al cliente que acaba de vincular';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customers WHERE id = v_cust_a2) THEN
    RAISE EXCEPTION 'AISLAMIENTO: B ve al cliente exclusivo de A tras vincular otro';
  END IF;
  IF public.link_customer_to_organization_by_rfc('ZZZ010101ZZ9') IS NOT NULL THEN
    RAISE EXCEPTION 'CLIENTES: el vínculo por RFC inventó un cliente inexistente';
  END IF;

  -- Archivar un cliente compartido sólo cierra la relación de B.
  PERFORM public.soft_delete_customer(v_cust_a1);
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_customers
    WHERE organization_id = v_org_b AND customer_id = v_cust_a1 AND status = 'archived'
  ) THEN
    RAISE EXCEPTION 'ARCHIVADO: la relación de B no quedó archivada';
  END IF;

  -- Archivar un cliente de A (sin relación con B) responde "no encontrado".
  BEGIN
    PERFORM public.soft_delete_customer(v_cust_a2);
    RAISE EXCEPTION 'ARCHIVADO: B archivó un cliente exclusivo de A';
  EXCEPTION WHEN raise_exception THEN NULL; END;

  RAISE NOTICE 'OK: B aislada de A, vínculo por RFC y archivado por relación';
END;
$$;

-- ── 3c. Desde A: el compartido sigue activo; el exclusivo se archiva global ─
RESET request.jwt.claims;
SET LOCAL request.jwt.claims TO
  '{"sub":"30000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

DO $$
DECLARE
  v_org_a uuid := current_setting('app.onb.org_a')::uuid;
  v_cust_a1 uuid := '30000000-0000-4000-8000-0000000000c1';
  v_cust_a2 uuid := '30000000-0000-4000-8000-0000000000c2';
  v_cust_b1 uuid := '30000000-0000-4000-8000-0000000000c3';
BEGIN
  IF EXISTS (SELECT 1 FROM public.customers WHERE id = v_cust_b1) THEN
    RAISE EXCEPTION 'AISLAMIENTO: A ve al cliente propio de B';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_cust_a1 AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'ARCHIVADO: el archivado por relación en B afectó la identidad global';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_customers
    WHERE organization_id = v_org_a AND customer_id = v_cust_a1 AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'ARCHIVADO: la relación de A con el compartido dejó de estar activa';
  END IF;

  PERFORM public.soft_delete_customer(v_cust_a2);
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_cust_a2 AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'ARCHIVADO: el único dueño no archivó la identidad global';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_customers
    WHERE organization_id = v_org_a AND customer_id = v_cust_a2 AND status = 'archived'
  ) THEN
    RAISE EXCEPTION 'ARCHIVADO: la relación de A no quedó archivada junto con la identidad';
  END IF;

  RAISE NOTICE 'OK: la identidad global sólo se archiva cuando la empresa es la única dueña';
END;
$$;

-- ── 4. Portal por empresa: la cuenta de B es invisible para A ────────
RESET request.jwt.claims;
RESET role;

DO $$
DECLARE
  v_org_b uuid := current_setting('app.onb.org_b')::uuid;
  v_portal_b uuid := '30000000-0000-4000-8000-0000000000d1';
  v_cust_b1 uuid := '30000000-0000-4000-8000-0000000000c3';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (v_portal_b, 'portal-b@onboarding.test',
          jsonb_build_object('full_name', 'Portal B'),
          jsonb_build_object('organization_id', v_org_b::text),
          now(), now())
  ON CONFLICT DO NOTHING;

  PERFORM set_config('app.organization_id', v_org_b::text, true);
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org_b, v_portal_b, 'portal');
  INSERT INTO public.customer_portal_accounts (organization_id, customer_id, auth_user_id, email)
  VALUES (v_org_b, v_cust_b1, v_portal_b, 'portal-b@onboarding.test');
END;
$$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"30000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.customer_portal_accounts
    WHERE customer_id = '30000000-0000-4000-8000-0000000000c3'
  ) THEN
    RAISE EXCEPTION 'PORTAL: el admin de A ve la cuenta de portal de B';
  END IF;
  RAISE NOTICE 'OK: cuentas de portal acotadas por empresa';
END;
$$;

RESET request.jwt.claims;
SET LOCAL request.jwt.claims TO
  '{"sub":"30000000-0000-4000-8000-0000000000b1","role":"authenticated"}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_portal_accounts
    WHERE customer_id = '30000000-0000-4000-8000-0000000000c3' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'PORTAL: el admin de B no ve la cuenta de portal de su cliente';
  END IF;
END;
$$;

-- ── 5. Suspensión de B ───────────────────────────────────────────────
-- 5a. El administrador de B no puede suspender/reactivar su empresa.
DO $$
DECLARE
  v_org_b uuid := current_setting('app.onb.org_b')::uuid;
  v_n integer;
BEGIN
  BEGIN
    WITH tocadas AS (
      UPDATE public.organizations SET is_active = false WHERE id = v_org_b RETURNING 1
    ) SELECT count(*) INTO v_n FROM tocadas;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'SUSPENSIÓN: un administrador de empresa cambió is_active';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Sí puede cambiar el nombre de su empresa (org_admin_manage se conserva).
  UPDATE public.organizations SET name = 'Empresa B renombrada' WHERE id = v_org_b;
  RAISE NOTICE 'OK: is_active sólo lo cambia la plataforma';
END;
$$;

-- 5b. El operador suspende a B (y no puede suspender su propia empresa).
RESET request.jwt.claims;
RESET role;

DO $$
DECLARE
  v_org_a uuid := current_setting('app.onb.org_a')::uuid;
  v_org_b uuid := current_setting('app.onb.org_b')::uuid;
  v_oper_a uuid := '30000000-0000-4000-8000-0000000000a1';
BEGIN
  BEGIN
    PERFORM public.platform_set_organization_active(v_oper_a, v_org_a, false);
    RAISE EXCEPTION 'SUSPENSIÓN: el operador suspendió su propia empresa';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM public.platform_set_organization_active(v_oper_a, v_org_b, false);
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org_b AND is_active) THEN
    RAISE EXCEPTION 'SUSPENSIÓN: B sigue activa';
  END IF;

  -- El permiso excepcional de 0061 sólo cubre el primer administrador de
  -- una empresa pendiente. Una empresa suspendida con miembros sigue cerrada.
  BEGIN
    INSERT INTO auth.users (id, email, raw_app_meta_data, created_at, updated_at)
    VALUES ('30000000-0000-4000-8000-0000000000b2', 'nuevo-b@onboarding.test',
            jsonb_build_object('organization_id', v_org_b::text), now(), now());
    RAISE EXCEPTION 'SUSPENSIÓN: se aprovisionó usuario en empresa suspendida';
  EXCEPTION WHEN check_violation THEN NULL; END;
END;
$$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"30000000-0000-4000-8000-0000000000b1","role":"authenticated"}';

DO $$
DECLARE
  v_org_b uuid := current_setting('app.onb.org_b')::uuid;
  v_n integer;
BEGIN
  -- La membresía sigue resolviendo (el navegador muestra el motivo), pero
  -- ninguna fila org-scoped es legible ni escribible.
  IF public.current_organization_id() IS DISTINCT FROM v_org_b THEN
    RAISE EXCEPTION 'SUSPENSIÓN: la membresía dejó de resolver (debe seguir para mostrar el motivo)';
  END IF;

  SELECT count(*) INTO v_n FROM public.customers;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'SUSPENSIÓN: un miembro de B suspendida lee % clientes', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.invoices;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'SUSPENSIÓN: un miembro de B suspendida lee facturas';
  END IF;

  BEGIN
    INSERT INTO public.customers (name) VALUES ('Alta con empresa suspendida');
    RAISE EXCEPTION 'SUSPENSIÓN: B suspendida dio de alta un cliente';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    INSERT INTO public.forklifts (name, model) VALUES ('MC-SUSP-01', 'M1');
    RAISE EXCEPTION 'SUSPENSIÓN: B suspendida dio de alta una unidad';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  BEGIN
    PERFORM public.resolve_organization_context();
    RAISE EXCEPTION 'SUSPENSIÓN: resolve_organization_context resolvió una empresa suspendida';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  RAISE NOTICE 'OK: empresa suspendida = sin lecturas ni escrituras org-scoped';
END;
$$;

-- 5c. A no se ve afectada por la suspensión de B.
RESET request.jwt.claims;
SET LOCAL request.jwt.claims TO
  '{"sub":"30000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = '30000000-0000-4000-8000-0000000000c1') THEN
    RAISE EXCEPTION 'SUSPENSIÓN: A perdió acceso a sus clientes al suspender B';
  END IF;
  RAISE NOTICE 'OK: la suspensión de B no afecta a A';
END;
$$;

-- 5d. Reactivación por el operador restablece a B.
RESET request.jwt.claims;
RESET role;
SELECT public.platform_set_organization_active(
  '30000000-0000-4000-8000-0000000000a1', current_setting('app.onb.org_b')::uuid, true);

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"30000000-0000-4000-8000-0000000000b1","role":"authenticated"}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = '30000000-0000-4000-8000-0000000000c3') THEN
    RAISE EXCEPTION 'REACTIVACIÓN: B no recuperó sus clientes';
  END IF;
  RAISE NOTICE 'OK: reactivación restablece a B';
END;
$$;

ROLLBACK;
