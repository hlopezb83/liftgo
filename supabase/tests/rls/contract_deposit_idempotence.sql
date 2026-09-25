-- Repetir un guardado o cambiar sólo notas no altera un depósito parcial.
BEGIN;

DO $setup$
DECLARE
  v_org uuid;
  v_user uuid := 'a7000000-0000-4000-8000-000000000001';
BEGIN
  SELECT id INTO v_org
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere una organización activa';
  END IF;

  PERFORM set_config('app.organization_id', v_org::text, true);
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_user, 'deposit-idempotence@rls.test', now(), now());
  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (v_org, v_user, 'internal')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.contracts (
    id, contract_number, organization_id, deposit_amount, deposit_status,
    deposit_settled_at, deposit_settled_amount, deposit_notes, updated_at
  ) VALUES (
    'a7000000-0000-4000-8000-000000000002', 'CTR-DEPOSIT-TEST', v_org,
    10000, 'applied', '2026-01-02 10:00:00+00', 4000,
    'Aplicado a renta', '2026-01-03 10:00:00+00'
  );
END $setup$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"a7000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $test$
DECLARE
  v_id uuid := 'a7000000-0000-4000-8000-000000000002';
  v_row public.contracts%ROWTYPE;
BEGIN
  PERFORM public.set_contract_deposit_status(v_id, 'applied', NULL, 'Aplicado a renta');
  SELECT * INTO v_row FROM public.contracts WHERE id = v_id;
  IF v_row.updated_at IS DISTINCT FROM '2026-01-03 10:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'Guardar sin cambios reescribió updated_at';
  END IF;

  PERFORM public.set_contract_deposit_status(v_id, 'applied', NULL, 'Nota actualizada');
  SELECT * INTO v_row FROM public.contracts WHERE id = v_id;
  IF v_row.deposit_settled_amount IS DISTINCT FROM 4000
     OR v_row.deposit_settled_at IS DISTINCT FROM '2026-01-02 10:00:00+00'::timestamptz
     OR v_row.deposit_notes IS DISTINCT FROM 'Nota actualizada' THEN
    RAISE EXCEPTION 'Editar notas alteró monto o fecha del depósito parcial';
  END IF;

  PERFORM public.set_contract_deposit_status(v_id, 'applied', 5000, 'Nota actualizada');
  SELECT * INTO v_row FROM public.contracts WHERE id = v_id;
  IF v_row.deposit_settled_amount IS DISTINCT FROM 5000
     OR v_row.deposit_settled_at IS DISTINCT FROM '2026-01-02 10:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'Ajustar el monto reescribió la fecha de aplicación';
  END IF;

  PERFORM public.set_contract_deposit_status(v_id, 'returned', NULL, 'Devuelto al cliente');
  SELECT * INTO v_row FROM public.contracts WHERE id = v_id;
  IF v_row.deposit_settled_amount IS DISTINCT FROM 5000
     OR v_row.deposit_settled_at IS NULL
     OR v_row.deposit_settled_at = '2026-01-02 10:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'Cambiar estado no conservó el monto ni registró fecha nueva';
  END IF;

  PERFORM public.set_contract_deposit_status(v_id, 'held', NULL, 'En garantía');
  SELECT * INTO v_row FROM public.contracts WHERE id = v_id;
  IF v_row.deposit_settled_amount IS NOT NULL OR v_row.deposit_settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Volver a retenido no limpió la liquidación';
  END IF;
END $test$;

ROLLBACK;
