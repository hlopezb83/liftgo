-- El resultado SAT pertenece a cada relación y sólo el servidor lo acredita.
BEGIN;

INSERT INTO public.organizations (id, name, slug) VALUES
  ('67000000-0000-4000-8000-0000000000a0', 'Elevación Norte', 'test-0067-norte'),
  ('67000000-0000-4000-8000-0000000000b0', 'Elevación Bajío', 'test-0067-bajio');

SELECT set_config('app.organization_id', '67000000-0000-4000-8000-0000000000a0', true);
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES ('67000000-0000-4000-8000-0000000000a1', 'admin-norte@0067.test', now(), now());
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
VALUES ('67000000-0000-4000-8000-0000000000a0', '67000000-0000-4000-8000-0000000000a1', 'internal');
INSERT INTO public.user_roles (user_id, role)
VALUES ('67000000-0000-4000-8000-0000000000a1', 'admin'::public.app_role)
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.customers (id, name, created_by_organization_id)
VALUES ('67000000-0000-4000-8000-0000000000c1', 'Cliente compartido',
        '67000000-0000-4000-8000-0000000000a0');
INSERT INTO public.organization_customers (organization_id, customer_id, rfc)
VALUES ('67000000-0000-4000-8000-0000000000a0',
        '67000000-0000-4000-8000-0000000000c1', 'AAA010101AAA');
SELECT set_config('app.organization_id', '67000000-0000-4000-8000-0000000000b0', true);
INSERT INTO public.organization_customers (organization_id, customer_id, rfc)
VALUES ('67000000-0000-4000-8000-0000000000b0',
        '67000000-0000-4000-8000-0000000000c1', 'BBB010101BBB');

-- El runner (postgres) simula el guardado del resultado del servicio.
UPDATE public.organization_customers
SET sat_validation_status = 'valid', sat_validated_at = now()
WHERE organization_id = '67000000-0000-4000-8000-0000000000a0'
  AND customer_id = '67000000-0000-4000-8000-0000000000c1';

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"67000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT set_config('app.organization_id', '67000000-0000-4000-8000-0000000000a0', true);

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.organization_customers
    SET sat_validation_status = 'mismatch'
    WHERE customer_id = '67000000-0000-4000-8000-0000000000c1';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION '0067: el navegador pudo escribir una validación SAT';
  END IF;
END $$;

UPDATE public.organization_customers SET rfc = 'AAA020202AAA'
WHERE customer_id = '67000000-0000-4000-8000-0000000000c1';

RESET ROLE;
RESET request.jwt.claims;
DO $$ BEGIN
  IF (SELECT sat_validation_status FROM public.organization_customers
      WHERE organization_id = '67000000-0000-4000-8000-0000000000a0'
        AND customer_id = '67000000-0000-4000-8000-0000000000c1') <> 'not_validated'
    OR (SELECT sat_validated_at FROM public.organization_customers
      WHERE organization_id = '67000000-0000-4000-8000-0000000000a0'
        AND customer_id = '67000000-0000-4000-8000-0000000000c1') IS NOT NULL
    OR (SELECT rfc FROM public.organization_customers
      WHERE organization_id = '67000000-0000-4000-8000-0000000000b0'
        AND customer_id = '67000000-0000-4000-8000-0000000000c1') <> 'BBB010101BBB' THEN
    RAISE EXCEPTION '0067: la edición fiscal no invalidó sólo el resultado local';
  END IF;
END $$;

ROLLBACK;
