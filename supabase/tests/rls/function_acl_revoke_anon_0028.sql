-- Multiempresa · verificación de la migración Drizzle 0028
-- (cierre de la superficie anónima en funciones de public).
--
-- Comprueba, sobre la base efímera de CI y terminando en ROLLBACK:
--   1. Ninguna de las 22 firmas conserva entrada ACL directa a anon,
--      entrada ACL a PUBLIC, ACL predeterminado (proacl IS NULL) ni
--      privilegio EFECTIVO de anon.
--   2. authenticated y service_role conservan sus grants legítimos.
--   3. El portal autenticado sigue pudiendo aceptar y rechazar su cotización.
--   4. Los triggers de escritura multiempresa siguen disparando.
BEGIN;

-- ── 1. Superficie anónima cerrada (cuatro vías) ──────────────────────
DO $$
DECLARE
  v_sig text;
  v_oid oid;
  v_acl aclitem[];
  v_direct_anon boolean;
  v_public boolean;
  v_default boolean;
  v_effective boolean;
  v_fallas text[] := '{}';
  v_firmas text[] := ARRAY[
    'public.accept_quote_from_portal(uuid,text)',
    'public.correct_return_inspection(uuid,text,text,text,numeric,numeric,text)',
    'public.current_organization_id()',
    'public.current_portal_customer_id()',
    'public.enforce_extension_invoice_link()',
    'public.enforce_membership_portal_account()',
    'public.enforce_organization_write_context()',
    'public.enforce_portal_account_membership()',
    'public.ensure_single_active_organization_customer()',
    'public.guard_credit_note_delete()',
    'public.invoice_eligible_for_payment_intent(uuid)',
    'public.invoice_in_current_organization(uuid)',
    'public.is_internal_member(uuid)',
    'public.organization_scope_matches(uuid)',
    'public.payment_proof_path_allowed(text,boolean)',
    'public.register_supplier_payment(uuid,numeric,date,text,text,text,text,text,uuid)',
    'public.reject_quote_from_portal(uuid,text)',
    'public.storage_document_owned_by_other_organization(text)',
    'public.storage_path_in_current_organization(text,boolean)',
    'public.storage_prefix_organization(text)',
    'public.storage_relative_segments(text)',
    'public.user_in_current_organization(uuid)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_firmas LOOP
    v_oid := v_sig::regprocedure;
    SELECT p.proacl INTO v_acl FROM pg_proc p WHERE p.oid = v_oid;

    v_default := v_acl IS NULL;

    SELECT
      coalesce(bool_or(a.grantee = 'anon'::regrole AND a.privilege_type = 'EXECUTE'), false),
      coalesce(bool_or(a.grantee = 0::oid AND a.privilege_type = 'EXECUTE'), false)
      INTO v_direct_anon, v_public
    FROM aclexplode(coalesce(v_acl, '{}'::aclitem[])) a;

    v_effective := has_function_privilege('anon', v_oid, 'EXECUTE');

    IF v_direct_anon THEN
      v_faltas_direct: NULL;
    END IF;

    IF v_direct_anon THEN
      v_fallas := v_fallas || (v_sig || ' → ACL almacenado con entrada directa a anon');
    END IF;
    IF v_public THEN
      v_fallas := v_fallas || (v_sig || ' → ACL almacenado con entrada a PUBLIC');
    END IF;
    IF v_default THEN
      v_fallas := v_fallas || (v_sig || ' → proacl IS NULL: ACL PREDETERMINADO de PostgreSQL (EXECUTE a PUBLIC)');
    END IF;
    IF v_effective THEN
      v_fallas := v_fallas || (v_sig || ' → anon conserva privilegio EFECTIVO (has_function_privilege)');
    END IF;
  END LOOP;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'ACL 0028: la superficie anónima sigue abierta:%s%',
      E'\n', array_to_string(v_fallas, E'\n');
  END IF;
END;
$$;

-- ── 2. Grants legítimos conservados ──────────────────────────────────
DO $$
DECLARE
  v_sig text;
  v_fallas text[] := '{}';
  v_firmas text[] := ARRAY[
    'public.accept_quote_from_portal(uuid,text)',
    'public.reject_quote_from_portal(uuid,text)',
    'public.register_supplier_payment(uuid,numeric,date,text,text,text,text,text,uuid)',
    'public.correct_return_inspection(uuid,text,text,text,numeric,numeric,text)',
    'public.current_organization_id()',
    'public.current_portal_customer_id()',
    'public.is_internal_member(uuid)',
    'public.user_in_current_organization(uuid)',
    'public.organization_scope_matches(uuid)',
    'public.invoice_in_current_organization(uuid)',
    'public.invoice_eligible_for_payment_intent(uuid)',
    'public.storage_prefix_organization(text)',
    'public.storage_path_in_current_organization(text,boolean)',
    'public.payment_proof_path_allowed(text,boolean)',
    'public.storage_document_owned_by_other_organization(text)',
    'public.storage_relative_segments(text)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_firmas LOOP
    IF NOT has_function_privilege('authenticated', v_sig::regprocedure, 'EXECUTE') THEN
      v_fallas := v_fallas || (v_sig || ' → authenticated PERDIÓ EXECUTE');
    END IF;
    IF NOT has_function_privilege('service_role', v_sig::regprocedure, 'EXECUTE') THEN
      v_fallas := v_fallas || (v_sig || ' → service_role PERDIÓ EXECUTE');
    END IF;
  END LOOP;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'ACL 0028: se perdieron permisos legítimos:%s%',
      E'\n', array_to_string(v_fallas, E'\n');
  END IF;
END;
$$;

-- ── 3. El portal autenticado sigue operando (y dispara triggers) ─────
SELECT set_config('app.organization_id', '28000000-0000-4000-8000-000000000028', true);

INSERT INTO public.organizations (id, name, slug)
VALUES ('28000000-0000-4000-8000-000000000028', 'Org ACL 0028', 'org-acl-0028');

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES ('28000000-0000-4000-8000-00000000a001', 'portal-acl0028@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('28000000-0000-4000-8000-00000000a001', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.customers (id, name, user_id)
VALUES ('28000000-0000-4000-8000-00000000c001', 'Cliente ACL 0028',
        '28000000-0000-4000-8000-00000000a001');

-- Dispara ensure_single_active_organization_customer y el guardia de contexto.
INSERT INTO public.organization_customers (organization_id, customer_id)
VALUES ('28000000-0000-4000-8000-000000000028', '28000000-0000-4000-8000-00000000c001');

-- Dispara enforce_portal_account_membership (crea la membresía 'portal').
INSERT INTO public.customer_portal_accounts
  (organization_id, customer_id, auth_user_id, email, status)
VALUES ('28000000-0000-4000-8000-000000000028',
        '28000000-0000-4000-8000-00000000c001',
        '28000000-0000-4000-8000-00000000a001',
        'portal-acl0028@test.local', 'active');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE auth_user_id = '28000000-0000-4000-8000-00000000a001'
      AND organization_id = '28000000-0000-4000-8000-000000000028'
  ) THEN
    RAISE EXCEPTION 'ACL 0028: el trigger de membresía de portal dejó de ejecutarse';
  END IF;
END;
$$;

INSERT INTO public.quotes
  (id, organization_id, customer_id, quote_number, status, total, subtotal, tax_amount)
VALUES
  ('28000000-0000-4000-8000-0000000000q1'::text::uuid,
   '28000000-0000-4000-8000-000000000028', '28000000-0000-4000-8000-00000000c001',
   'COT-ACL-0028-A', 'sent', 100, 100, 0),
  ('28000000-0000-4000-8000-0000000000q2'::text::uuid,
   '28000000-0000-4000-8000-000000000028', '28000000-0000-4000-8000-00000000c001',
   'COT-ACL-0028-B', 'sent', 100, 100, 0);

RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"28000000-0000-4000-8000-00000000a001","role":"authenticated"}';

DO $$
DECLARE
  v_quote public.quotes;
BEGIN
  v_quote := public.accept_quote_from_portal('28000000-0000-4000-8000-0000000000q1'::text::uuid, '127.0.0.1');
  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'ACL 0028: el portal autenticado no pudo aceptar su cotización (estado %)', v_quote.status;
  END IF;

  v_quote := public.reject_quote_from_portal('28000000-0000-4000-8000-0000000000q2'::text::uuid, 'prueba');
  IF v_quote.status <> 'rejected' THEN
    RAISE EXCEPTION 'ACL 0028: el portal autenticado no pudo rechazar su cotización (estado %)', v_quote.status;
  END IF;

  -- Las policies siguen evaluándose con los helpers revocados a anon.
  IF NOT EXISTS (SELECT 1 FROM public.quotes WHERE id = '28000000-0000-4000-8000-0000000000q1'::text::uuid) THEN
    RAISE EXCEPTION 'ACL 0028: el portal dejó de ver su propia cotización (helpers de policy sin permiso)';
  END IF;
END;
$$;

ROLLBACK;
