-- RLS: customer_payment_intents (portal)
-- Guard 1: cliente A no puede crear un intent con customer_id apuntando a B.
-- Guard 2 (BL-25/26): NADIE actualiza customer_payment_intents directamente
--   desde el portal. La aprobación/rechazo pasa por las RPC SECURITY DEFINER
--   approve_payment_intent / reject_payment_intent. Antes esto se "probaba"
--   desde Vitest contra el proyecto REAL con un UUID de ceros; aquí se prueba
--   contra la DB local efímera con una fila válida.
BEGIN;

-- Setup: dos usuarios cliente
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'cliente-a@test.local', now(), now()),
  ('b2222222-2222-4222-8222-222222222222', 'cliente-b@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, user_id)
VALUES
  ('c1111111-1111-4111-8111-111111111111', 'Cliente A', 'a1111111-1111-4111-8111-111111111111'),
  ('c2222222-2222-4222-8222-222222222222', 'Cliente B', 'b2222222-2222-4222-8222-222222222222')
ON CONFLICT DO NOTHING;

-- User A intenta pagar como user B: DEBE fallar
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.customer_payment_intents (customer_id, amount, currency, status)
    VALUES ('c2222222-2222-4222-8222-222222222222', 100, 'MXN', 'pending');
    -- Señal deliberada de brecha: se relanza fuera del bloque para que el
    -- manejador `OTHERS` de abajo no la trague y produzca un falso verde.
    RAISE EXCEPTION 'RLS_BREACH_CROSS_CUSTOMER_INSERT' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      RAISE;
    WHEN OTHERS THEN
      RAISE NOTICE 'OK: RLS bloqueó insert cross-customer (%).', SQLSTATE;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- Guard 2: UPDATE directo sobre una fila REAL y local.
-- ---------------------------------------------------------------------------
RESET role;
RESET request.jwt.claims;

INSERT INTO public.customer_payment_intents (id, customer_id, amount, currency, status)
VALUES (
  'd3333333-3333-4333-8333-333333333333',
  'c1111111-1111-4111-8111-111111111111',
  250, 'MXN', 'pending'
)
ON CONFLICT (id) DO UPDATE SET status = 'pending';

-- 2a) anon no puede actualizar.
SET LOCAL role = 'anon';
DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    UPDATE public.customer_payment_intents
       SET status = 'approved'
     WHERE id = 'd3333333-3333-4333-8333-333333333333';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'RLS_BREACH_ANON_UPDATE' USING ERRCODE = 'P0001';
    END IF;
    RAISE NOTICE 'OK: anon no actualizó ninguna fila.';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      RAISE;
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: anon rechazado por privilegios.';
  END;
END $$;

-- 2b) el propio cliente dueño (customer) tampoco puede actualizar directo.
RESET role;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}';
DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    UPDATE public.customer_payment_intents
       SET status = 'approved'
     WHERE id = 'd3333333-3333-4333-8333-333333333333';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'RLS_BREACH_CUSTOMER_UPDATE' USING ERRCODE = 'P0001';
    END IF;
    RAISE NOTICE 'OK: customer dueño no actualizó ninguna fila.';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      RAISE;
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: customer rechazado por privilegios.';
  END;
END $$;

-- 2c) la fila queda intacta.
RESET role;
RESET request.jwt.claims;
DO $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
    FROM public.customer_payment_intents
   WHERE id = 'd3333333-3333-4333-8333-333333333333';
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'RLS_BREACH: el intent quedó en status=% (esperado pending)', v_status;
  END IF;
  RAISE NOTICE 'OK: el intent sigue en pending.';
END $$;

ROLLBACK;
