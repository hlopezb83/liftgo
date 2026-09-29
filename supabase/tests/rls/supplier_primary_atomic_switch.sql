-- Supplier primary bank/contact changes must be atomic and serialized by supplier.
BEGIN;

DO $context$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id
    INTO v_org_id
    FROM public.organizations
   WHERE is_active
   ORDER BY created_at
   LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere una organización activa';
  END IF;

  PERFORM set_config('app.organization_id', v_org_id::text, true);
END;
$context$;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES ('69000000-0000-4000-8000-000000000001', 'supplier-primary@rls.test', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
SELECT id, '69000000-0000-4000-8000-000000000001', 'internal'
  FROM public.organizations
 WHERE is_active
 ORDER BY created_at
 LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('69000000-0000-4000-8000-000000000001', 'admin'::public.app_role)
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.suppliers (id, name)
VALUES ('69000000-0000-4000-8000-000000000010', 'Proveedor prueba de primarios');

INSERT INTO public.supplier_bank_accounts (
  id, supplier_id, bank_name, account_holder, is_primary
)
VALUES
  ('69000000-0000-4000-8000-000000000011', '69000000-0000-4000-8000-000000000010', 'Banco anterior', 'LiftGo', true),
  ('69000000-0000-4000-8000-000000000012', '69000000-0000-4000-8000-000000000010', 'Banco alterno', 'LiftGo', false);

INSERT INTO public.supplier_contacts (id, supplier_id, name, is_primary)
VALUES
  ('69000000-0000-4000-8000-000000000013', '69000000-0000-4000-8000-000000000010', 'Contacto anterior', true),
  ('69000000-0000-4000-8000-000000000014', '69000000-0000-4000-8000-000000000010', 'Contacto alterno', false);

-- These temporary checks force a failure after each function has demoted the
-- previous primary but before the target update can complete.
ALTER TABLE public.supplier_bank_accounts
  ADD CONSTRAINT supplier_bank_primary_atomic_test_fail
  CHECK (id <> '69000000-0000-4000-8000-000000000012'::uuid OR is_primary = false)
  NOT VALID;
ALTER TABLE public.supplier_contacts
  ADD CONSTRAINT supplier_contact_primary_atomic_test_fail
  CHECK (id <> '69000000-0000-4000-8000-000000000014'::uuid OR is_primary = false)
  NOT VALID;

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"69000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $atomicity$
DECLARE
  v_failed boolean;
BEGIN
  v_failed := false;
  BEGIN
    PERFORM public.save_supplier_bank_account(
      '69000000-0000-4000-8000-000000000010',
      '69000000-0000-4000-8000-000000000012',
      'Banco alterno actualizado', 'LiftGo', NULL, NULL, 'MXN', NULL, true
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'ATOMICIDAD: se esperaba que fallara la edición bancaria';
  END IF;

  IF NOT (SELECT is_primary FROM public.supplier_bank_accounts
           WHERE id = '69000000-0000-4000-8000-000000000011')
     OR (SELECT is_primary FROM public.supplier_bank_accounts
          WHERE id = '69000000-0000-4000-8000-000000000012') THEN
    RAISE EXCEPTION 'ATOMICIDAD: una falla bancaria dejó al proveedor sin su cuenta primaria anterior';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.save_supplier_contact(
      '69000000-0000-4000-8000-000000000010',
      '69000000-0000-4000-8000-000000000014',
      'Contacto alterno actualizado', NULL, NULL, 'Ventas', NULL, true
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'ATOMICIDAD: se esperaba que fallara la edición del contacto';
  END IF;

  IF NOT (SELECT is_primary FROM public.supplier_contacts
           WHERE id = '69000000-0000-4000-8000-000000000013')
     OR (SELECT is_primary FROM public.supplier_contacts
          WHERE id = '69000000-0000-4000-8000-000000000014') THEN
    RAISE EXCEPTION 'ATOMICIDAD: una falla de contacto dejó al proveedor sin su contacto primario anterior';
  END IF;
END;
$atomicity$;

RESET ROLE;
ALTER TABLE public.supplier_bank_accounts DROP CONSTRAINT supplier_bank_primary_atomic_test_fail;
ALTER TABLE public.supplier_contacts DROP CONSTRAINT supplier_contact_primary_atomic_test_fail;
SET LOCAL role = authenticated;

DO $success$
DECLARE
  v_new_bank_id uuid;
  v_new_contact_id uuid;
BEGIN
  PERFORM public.save_supplier_bank_account(
    '69000000-0000-4000-8000-000000000010',
    '69000000-0000-4000-8000-000000000012',
    'Banco alterno actualizado', 'LiftGo', NULL, NULL, 'MXN', NULL, true
  );

  IF (SELECT count(*) FROM public.supplier_bank_accounts
       WHERE supplier_id = '69000000-0000-4000-8000-000000000010'
         AND is_primary) <> 1
     OR NOT (SELECT is_primary FROM public.supplier_bank_accounts
              WHERE id = '69000000-0000-4000-8000-000000000012') THEN
    RAISE EXCEPTION 'REGRESIÓN: el cambio de cuenta primaria no se completó';
  END IF;

  PERFORM public.save_supplier_contact(
    '69000000-0000-4000-8000-000000000010',
    '69000000-0000-4000-8000-000000000014',
    'Contacto alterno actualizado', NULL, NULL, 'Ventas', NULL, true
  );

  IF (SELECT count(*) FROM public.supplier_contacts
       WHERE supplier_id = '69000000-0000-4000-8000-000000000010'
         AND is_primary) <> 1
     OR NOT (SELECT is_primary FROM public.supplier_contacts
              WHERE id = '69000000-0000-4000-8000-000000000014') THEN
    RAISE EXCEPTION 'REGRESIÓN: el cambio de contacto primario no se completó';
  END IF;

  v_new_bank_id := public.save_supplier_bank_account(
    '69000000-0000-4000-8000-000000000010',
    NULL,
    'Banco nuevo', 'LiftGo', NULL, NULL, 'MXN', NULL, true
  );

  v_new_contact_id := public.save_supplier_contact(
    '69000000-0000-4000-8000-000000000010',
    NULL,
    'Contacto nuevo', NULL, NULL, 'Operaciones', NULL, true
  );

  IF (SELECT count(*) FROM public.supplier_bank_accounts
       WHERE supplier_id = '69000000-0000-4000-8000-000000000010'
         AND is_primary) <> 1
     OR NOT (SELECT is_primary FROM public.supplier_bank_accounts WHERE id = v_new_bank_id) THEN
    RAISE EXCEPTION 'REGRESIÓN: el alta de cuenta primaria no fue atómica';
  END IF;

  IF (SELECT count(*) FROM public.supplier_contacts
       WHERE supplier_id = '69000000-0000-4000-8000-000000000010'
         AND is_primary) <> 1
     OR NOT (SELECT is_primary FROM public.supplier_contacts WHERE id = v_new_contact_id) THEN
    RAISE EXCEPTION 'REGRESIÓN: el alta de contacto primario no fue atómica';
  END IF;
END;
$success$;

RESET ROLE;
ROLLBACK;
