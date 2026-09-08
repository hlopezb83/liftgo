-- RLS: customer_payment_intents (portal) — DB LOCAL EFÍMERA.
-- Guard 0: el cliente dueño SÍ lee su propia fila (evita falso verde por una
--   sesión sin rol customer, que bloquearía todo por accidente).
-- Guard 1: cliente A no puede crear un intent para el cliente B.
-- Guard 2 (BL-25/26): NADIE actualiza customer_payment_intents directamente
--   desde el portal; la aprobación pasa por RPC SECURITY DEFINER.
-- Fixtures válidas según el esquema real: invoice_id y transfer_date son
-- NOT NULL y el enum payment_intent_status es ('pending_review','approved','rejected').
BEGIN;

-- Setup (rol de servicio, sin RLS aplicada al owner de la sesión de pruebas)
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'cliente-a-cpi@test.local', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', 'cliente-b-cpi@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'customer'),
  ('b2222222-2222-4222-8222-222222222222', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'Cliente A CPI', 'a1111111-1111-4111-8111-111111111111'),
  ('c2222222-2222-4222-8222-222222222222', 'Cliente B CPI', 'b2222222-2222-4222-8222-222222222222');

INSERT INTO public.invoices (id, invoice_number, customer_id, customer_name, subtotal, tax_amount, total, status, line_items) VALUES
  ('f1111111-1111-4111-8111-111111111111', 'FAC-CPI-A', 'c1111111-1111-4111-8111-111111111111', 'Cliente A CPI', 250, 0, 250, 'sent',
   '[{"description":"Renta CPI A","quantity":1,"unit_price":250,"amount":250}]'::jsonb),
  ('f2222222-2222-4222-8222-222222222222', 'FAC-CPI-B', 'c2222222-2222-4222-8222-222222222222', 'Cliente B CPI', 300, 0, 300, 'sent',
   '[{"description":"Renta CPI B","quantity":1,"unit_price":300,"amount":300}]'::jsonb);

INSERT INTO public.customer_payment_intents
  (id, invoice_id, customer_id, amount, transfer_date, status)
VALUES (
  'd3333333-3333-4333-8333-333333333333',
  'f1111111-1111-4111-8111-111111111111',
  'c1111111-1111-4111-8111-111111111111',
  250, current_date, 'pending_review'
);

-- ---------------------------------------------------------------------------
-- Guard 0 + Guard 1 como el cliente A
-- ---------------------------------------------------------------------------
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
DECLARE
  v_blocked boolean := false;
BEGIN
  -- Guard 0: la sesión tiene el rol correcto y ve su propia fila.
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_payment_intents
     WHERE id = 'd3333333-3333-4333-8333-333333333333'
  ) THEN
    RAISE EXCEPTION 'SETUP INVÁLIDO: el cliente dueño no lee su propio intent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_payment_intents
     WHERE customer_id = 'c2222222-2222-4222-8222-222222222222'
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: el cliente A ve intents del cliente B';
  END IF;

  -- Guard 1: insert cross-customer con fixtures VÁLIDAS (mismos datos que la
  -- fila legítima del cliente B). Sólo el SQLSTATE de denegación cuenta como
  -- éxito: cualquier enum/FK/NOT NULL incorrecto revienta el test.
  BEGIN
    INSERT INTO public.customer_payment_intents
      (invoice_id, customer_id, amount, transfer_date, status)
    VALUES (
      'f2222222-2222-4222-8222-222222222222',
      'c2222222-2222-4222-8222-222222222222',
      100, current_date, 'pending_review'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: el cliente A creó un intent para el cliente B';
  END IF;
  RAISE NOTICE 'OK: RLS bloqueó el insert cross-customer.';
END $$;

-- ---------------------------------------------------------------------------
-- Guard 2: UPDATE directo sobre la fila real.
-- ---------------------------------------------------------------------------
-- 2a) anon no puede actualizar.
RESET role;
RESET request.jwt.claims;
SET LOCAL role = 'anon';
DO $$
DECLARE
  v_rows integer;
  v_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.customer_payment_intents
       SET status = 'approved'
     WHERE id = 'd3333333-3333-4333-8333-333333333333';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_blocked := v_rows = 0;
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: anon actualizó el intent';
  END IF;
  RAISE NOTICE 'OK: anon no pudo actualizar.';
END $$;

-- 2b) el propio cliente dueño tampoco puede actualizar directo.
RESET role;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
DO $$
DECLARE
  v_rows integer;
  v_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.customer_payment_intents
       SET status = 'approved'
     WHERE id = 'd3333333-3333-4333-8333-333333333333';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_blocked := v_rows = 0;
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: el cliente dueño actualizó su intent directo';
  END IF;
  RAISE NOTICE 'OK: customer dueño no pudo actualizar.';
END $$;

-- 2c) la fila queda intacta.
RESET role;
RESET request.jwt.claims;
DO $$
DECLARE
  v_status public.payment_intent_status;
BEGIN
  SELECT status INTO v_status
    FROM public.customer_payment_intents
   WHERE id = 'd3333333-3333-4333-8333-333333333333';
  IF v_status IS DISTINCT FROM 'pending_review' THEN
    RAISE EXCEPTION 'RLS BREACH: el intent quedó en status=% (esperado pending_review)', v_status;
  END IF;
  RAISE NOTICE 'OK: el intent sigue en pending_review.';
END $$;

ROLLBACK;
