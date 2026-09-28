-- Contract numbers are allocated in the INSERT transaction. A rejected
-- contract must not consume the first number of a new organization.
BEGIN;

INSERT INTO public.organizations (id, name, slug, is_active) VALUES
  ('74000000-0000-4000-8000-0000000000a0', 'Flota Norte Contratos', 'folio-atomic-a', true);
SELECT set_config('app.organization_id', '74000000-0000-4000-8000-0000000000a0', true);

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('74000000-0000-4000-8000-0000000000a1', 'folio-atomic-admin@test.local', now(), now());
INSERT INTO public.user_roles (user_id, role) VALUES
  ('74000000-0000-4000-8000-0000000000a1', 'admin');
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('74000000-0000-4000-8000-0000000000a0', '74000000-0000-4000-8000-0000000000a1', 'internal');

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"74000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
  v_number text;
BEGIN
  BEGIN
    INSERT INTO public.contracts (contract_number, start_date, end_date)
    VALUES ('', current_date, current_date - 1);
    RAISE EXCEPTION 'The invalid contract should have failed';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.contracts (contract_number)
  VALUES ('') RETURNING contract_number INTO v_number;
  IF v_number <> 'CTR-0001' THEN
    RAISE EXCEPTION 'A rejected insert consumed the first contract number: %', v_number;
  END IF;
END $$;

ROLLBACK;
