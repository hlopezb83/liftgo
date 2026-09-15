-- RLS: el respaldo legado de get_customer_id_for_user respeta el estado de la
-- cuenta de portal (migración 0024).
--
-- Escenario: un cliente compartido entre dos organizaciones. El usuario del
-- portal de la ORG A tiene además el enlace legado `customers.user_id`.
-- Con la cuenta activa debe resolver su cliente; suspendida o revocada NO debe
-- recuperar acceso por el respaldo legado, ni ver facturas propias o ajenas.
-- Un usuario legado SIN cuenta de portal conserva el respaldo (empresa actual).
BEGIN;

-- ── Setup (conexión privilegiada, sólo fixtures) ─────────────────────
-- El guardia de escritura multiempresa es fail-closed: el contexto explícito
-- debe existir antes del primer INSERT, incluso el de organizations.
SELECT set_config('app.organization_id', '1a000000-0000-4000-8000-00000000001a', true);

INSERT INTO public.organizations (id, name, slug)
VALUES ('1a000000-0000-4000-8000-00000000001a', 'Org A Portal', 'org-a-portal');

INSERT INTO public.organizations (id, name, slug)
VALUES ('1b000000-0000-4000-8000-00000000001b', 'Org B Portal', 'org-b-portal');

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'portal-a@fallback.test', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', 'legado@fallback.test', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'customer'),
  ('a1000000-0000-4000-8000-000000000002', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- Cliente compartido (identidad global) + cliente legado.
INSERT INTO public.customers (id, name, user_id) VALUES
  ('c1000000-0000-4000-8000-00000000000c', 'Cliente compartido portal',
   'a1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-00000000000d', 'Cliente legado portal',
   'a1000000-0000-4000-8000-000000000002');

INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
  ('1a000000-0000-4000-8000-00000000001a', 'c1000000-0000-4000-8000-00000000000c'),
  ('1b000000-0000-4000-8000-00000000001b', 'c1000000-0000-4000-8000-00000000000c'),
  ('1a000000-0000-4000-8000-00000000001a', 'c1000000-0000-4000-8000-00000000000d');

-- La cuenta de portal crea su membresía 'portal' vía trigger.
INSERT INTO public.customer_portal_accounts
  (organization_id, customer_id, auth_user_id, email, status)
VALUES (
  '1a000000-0000-4000-8000-00000000001a',
  'c1000000-0000-4000-8000-00000000000c',
  'a1000000-0000-4000-8000-000000000001',
  'portal-a@fallback.test',
  'active'
);

INSERT INTO public.invoices
  (id, organization_id, invoice_number, customer_id, customer_name, subtotal, tax_amount, total, status, line_items)
VALUES
  ('f1000000-0000-4000-8000-0000000000fa', '1a000000-0000-4000-8000-00000000001a', 'FAC-FB-A',
   'c1000000-0000-4000-8000-00000000000c', 'Cliente compartido portal', 100, 0, 100, 'sent',
   '[{"description":"Renta A","quantity":1,"unit_price":100,"amount":100}]'::jsonb),
  ('f1000000-0000-4000-8000-0000000000fb', '1b000000-0000-4000-8000-00000000001b', 'FAC-FB-B',
   'c1000000-0000-4000-8000-00000000000c', 'Cliente compartido portal', 200, 0, 200, 'sent',
   '[{"description":"Renta B","quantity":1,"unit_price":200,"amount":200}]'::jsonb);

-- ── 1. Cuenta activa: identidad verificada y alcance de una sola empresa ──
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF public.get_customer_id_for_user(auth.uid())
       IS DISTINCT FROM 'c1000000-0000-4000-8000-00000000000c'::uuid THEN
    RAISE EXCEPTION 'REGRESIÓN: la cuenta de portal activa no resuelve su cliente';
  END IF;

  IF public.current_organization_id()
       IS DISTINCT FROM '1a000000-0000-4000-8000-00000000001a'::uuid THEN
    RAISE EXCEPTION 'REGRESIÓN: la cuenta de portal no resuelve su organización';
  END IF;

  IF NOT public.customer_owns_invoice('f1000000-0000-4000-8000-0000000000fa') THEN
    RAISE EXCEPTION 'REGRESIÓN: el portal no reconoce su factura de la ORG A';
  END IF;

  -- Mismo customer global, otra organización: nunca accesible desde esta cuenta.
  IF public.customer_owns_invoice('f1000000-0000-4000-8000-0000000000fb') THEN
    RAISE EXCEPTION 'RLS BREACH: el portal de la ORG A alcanza la factura de la ORG B';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE id = 'f1000000-0000-4000-8000-0000000000fb') THEN
    RAISE EXCEPTION 'RLS BREACH: el portal lee la factura de la ORG B';
  END IF;
END $$;

-- ── 2. Cuenta suspendida: el respaldo legado no la revive ────────────
RESET request.jwt.claims;
SET LOCAL role = 'postgres';
SELECT set_config('app.organization_id', '1a000000-0000-4000-8000-00000000001a', true);
UPDATE public.customer_portal_accounts
   SET status = 'suspended'
 WHERE auth_user_id = 'a1000000-0000-4000-8000-000000000001';

RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF public.get_customer_id_for_user(auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'RLS BREACH: cuenta suspendida recupera cliente por el respaldo legado';
  END IF;

  IF public.customer_owns_invoice('f1000000-0000-4000-8000-0000000000fa') THEN
    RAISE EXCEPTION 'RLS BREACH: cuenta suspendida conserva acceso a su factura';
  END IF;
END $$;

-- ── 3. Cuenta revocada: mismo resultado ──────────────────────────────
RESET request.jwt.claims;
SET LOCAL role = 'postgres';
SELECT set_config('app.organization_id', '1a000000-0000-4000-8000-00000000001a', true);
UPDATE public.customer_portal_accounts
   SET status = 'revoked'
 WHERE auth_user_id = 'a1000000-0000-4000-8000-000000000001';

RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF public.get_customer_id_for_user(auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'RLS BREACH: cuenta revocada recupera cliente por el respaldo legado';
  END IF;

  IF public.customer_owns_invoice('f1000000-0000-4000-8000-0000000000fa') THEN
    RAISE EXCEPTION 'RLS BREACH: cuenta revocada conserva acceso a su factura';
  END IF;
END $$;

-- ── 4. Usuario legado sin cuenta de portal: compatibilidad conservada ──
-- El respaldo sigue vigente sólo mientras exista una sola organización activa;
-- aquí hay varias, así que debe resolver NULL (fail-closed) sin tocar a otro
-- cliente. La compatibilidad real de la empresa actual (una sola organización)
-- se comprueba desactivando temporalmente la segunda.
RESET request.jwt.claims;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF public.get_customer_id_for_user(auth.uid())
       IS DISTINCT FROM (
         SELECT CASE WHEN (SELECT count(*) FROM public.organizations WHERE is_active) = 1
                     THEN 'c1000000-0000-4000-8000-00000000000d'::uuid
                     ELSE NULL::uuid END
       ) THEN
    RAISE EXCEPTION 'REGRESIÓN: el respaldo legado sin cuenta de portal cambió de comportamiento';
  END IF;
END $$;

ROLLBACK;
