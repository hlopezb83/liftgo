-- La identidad compartida no admite edición global desde ninguna empresa.
-- Cada una conserva sus propios datos y el archivado es por relación.
BEGIN;

INSERT INTO public.organizations (id, name, slug) VALUES
  ('62000000-0000-4000-8000-0000000000a0', 'Elevación Norte', 'test-0062-norte'),
  ('62000000-0000-4000-8000-0000000000b0', 'Elevación Bajío', 'test-0062-bajio');

SELECT set_config('app.organization_id', '62000000-0000-4000-8000-0000000000a0', true);
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES ('62000000-0000-4000-8000-0000000000a1', 'admin-norte@0062.test', now(), now());
SELECT set_config('app.organization_id', '62000000-0000-4000-8000-0000000000b0', true);
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES ('62000000-0000-4000-8000-0000000000b1', 'admin-bajio@0062.test', now(), now());

INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('62000000-0000-4000-8000-0000000000a0', '62000000-0000-4000-8000-0000000000a1', 'internal'),
  ('62000000-0000-4000-8000-0000000000b0', '62000000-0000-4000-8000-0000000000b1', 'internal');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('62000000-0000-4000-8000-0000000000a1', 'admin'::public.app_role),
  ('62000000-0000-4000-8000-0000000000b1', 'admin'::public.app_role)
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

SELECT set_config('app.organization_id', '62000000-0000-4000-8000-0000000000a0', true);
INSERT INTO public.customers (id, name, created_by_organization_id) VALUES
  ('62000000-0000-4000-8000-0000000000c1', 'Identidad compartida', '62000000-0000-4000-8000-0000000000a0');
INSERT INTO public.organization_customers (organization_id, customer_id, alias, email) VALUES
  ('62000000-0000-4000-8000-0000000000a0', '62000000-0000-4000-8000-0000000000c1', 'Cliente Norte', 'norte@0062.test'),
  ('62000000-0000-4000-8000-0000000000b0', '62000000-0000-4000-8000-0000000000c1', 'Cliente Bajío', 'bajio@0062.test');

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"62000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
UPDATE public.organization_customers
SET email = 'ventas.norte@0062.test', updated_at = now()
WHERE customer_id = '62000000-0000-4000-8000-0000000000c1';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.customers SET name = 'Cambio global indebido'
    WHERE id = '62000000-0000-4000-8000-0000000000c1';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION '0062: el administrador fundador pudo editar una identidad compartida';
  END IF;
END $$;

SELECT public.soft_delete_customer('62000000-0000-4000-8000-0000000000c1');

RESET ROLE;
RESET request.jwt.claims;
DO $$
BEGIN
  IF (SELECT email FROM public.organization_customers
      WHERE organization_id = '62000000-0000-4000-8000-0000000000b0'
        AND customer_id = '62000000-0000-4000-8000-0000000000c1') <> 'bajio@0062.test'
     OR (SELECT status FROM public.organization_customers
      WHERE organization_id = '62000000-0000-4000-8000-0000000000b0'
        AND customer_id = '62000000-0000-4000-8000-0000000000c1') <> 'active'
     OR (SELECT deleted_at FROM public.customers
      WHERE id = '62000000-0000-4000-8000-0000000000c1') IS NOT NULL THEN
    RAISE EXCEPTION '0062: la edición o el archivado de Norte afectó a Bajío';
  END IF;
END $$;

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"62000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
SELECT set_config('app.organization_id', '62000000-0000-4000-8000-0000000000b0', true);
-- La relación de Norte ya está archivada: Bajío tampoco puede borrar la
-- identidad global ni modificarla; su archivado sigue siendo local.
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.customers SET name = 'Cambio global desde Bajío'
    WHERE id = '62000000-0000-4000-8000-0000000000c1';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION '0062: Bajío pudo editar el cliente global'; END IF;
END $$;
SELECT public.soft_delete_customer('62000000-0000-4000-8000-0000000000c1');

RESET ROLE;
RESET request.jwt.claims;
DO $$
BEGIN
  IF (SELECT deleted_at FROM public.customers
      WHERE id = '62000000-0000-4000-8000-0000000000c1') IS NOT NULL THEN
    RAISE EXCEPTION '0062: se archivó globalmente una identidad con historial multiempresa';
  END IF;
END $$;

ROLLBACK;
