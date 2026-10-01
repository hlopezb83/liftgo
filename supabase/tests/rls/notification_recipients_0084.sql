-- Run only against the ephemeral CI database; preserve all fixtures with rollback.
BEGIN;
INSERT INTO public.organizations (id, name, slug) VALUES
  ('84000000-0000-4000-8000-0000000000a0', 'Avisos Norte', 'notificaciones-0084-a'),
  ('84000000-0000-4000-8000-0000000000b0', 'Avisos Bajío', 'notificaciones-0084-b');
SELECT set_config('app.organization_id', '84000000-0000-4000-8000-0000000000a0', true);
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('84000000-0000-4000-8000-000000000001', 'admin-a@0084.test', now(), now()),
  ('84000000-0000-4000-8000-000000000002', 'finanzas-a@0084.test', now(), now()),
  ('84000000-0000-4000-8000-000000000003', 'admin-b@0084.test', now(), now()),
  ('84000000-0000-4000-8000-000000000004', 'portal-a@0084.test', now(), now()),
  ('84000000-0000-4000-8000-000000000005', 'inactivo-a@0084.test', now(), now()),
  ('84000000-0000-4000-8000-000000000006', 'sin-empresa@0084.test', now(), now());
INSERT INTO public.user_roles (user_id, role) VALUES
  ('84000000-0000-4000-8000-000000000001', 'admin'),
  ('84000000-0000-4000-8000-000000000002', 'administrativo'),
  ('84000000-0000-4000-8000-000000000003', 'admin'),
  ('84000000-0000-4000-8000-000000000004', 'admin'),
  ('84000000-0000-4000-8000-000000000005', 'administrativo'),
  ('84000000-0000-4000-8000-000000000006', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('84000000-0000-4000-8000-0000000000a0', '84000000-0000-4000-8000-000000000001', 'internal'),
  ('84000000-0000-4000-8000-0000000000a0', '84000000-0000-4000-8000-000000000002', 'internal'),
  ('84000000-0000-4000-8000-0000000000b0', '84000000-0000-4000-8000-000000000003', 'internal'),
  ('84000000-0000-4000-8000-0000000000a0', '84000000-0000-4000-8000-000000000004', 'portal'),
  ('84000000-0000-4000-8000-0000000000a0', '84000000-0000-4000-8000-000000000005', 'internal');
UPDATE public.profiles SET is_active = false
WHERE user_id = '84000000-0000-4000-8000-000000000005';
INSERT INTO public.invoices
  (id, organization_id, invoice_number, customer_name, subtotal, tax_amount, total, status, moneda)
VALUES ('84000000-0000-4000-8000-0000000000f0',
  '84000000-0000-4000-8000-0000000000a0', 'FAC-0084-A', 'Avisos prueba', 100, 0, 100, 'sent', 'USD');

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"84000000-0000-4000-8000-000000000002","role":"authenticated"}';
INSERT INTO public.payments (invoice_id, amount, payment_date, reference_number)
VALUES ('84000000-0000-4000-8000-0000000000f0', 10, CURRENT_DATE, 'NOTIFICATION-0084');

DO $test$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.notify_organization_admins(
      '84000000-0000-4000-8000-0000000000b0', 'info', 'No permitido');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: cliente eligió destinatarios de otra empresa';
  END IF;
END;
$test$;
RESET ROLE;
RESET request.jwt.claims;
DO $test$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.notifications
  WHERE entity_id = '84000000-0000-4000-8000-0000000000f0' AND type = 'payment_received';
  IF v_count <> 2 THEN RAISE EXCEPTION 'RLS ROTA: esperado 2 destinatarios, observado %', v_count; END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE entity_id = '84000000-0000-4000-8000-0000000000f0'
      AND (organization_id <> '84000000-0000-4000-8000-0000000000a0'
        OR user_id NOT IN ('84000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002')
        OR message NOT LIKE '% USD %')
  ) THEN RAISE EXCEPTION 'RLS BREACH: destinatario, empresa o moneda incorrectos'; END IF;
END;
$test$;
-- An authorized recipient reads only their own event.
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"84000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.notifications WHERE entity_id = '84000000-0000-4000-8000-0000000000f0') <> 1
  THEN RAISE EXCEPTION 'RLS ROTA: destinatario no lee su aviso'; END IF;
END;
$test$;
SET LOCAL request.jwt.claims TO '{"sub":"84000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.notifications WHERE entity_id = '84000000-0000-4000-8000-0000000000f0')
  THEN RAISE EXCEPTION 'RLS BREACH: Admin B lee avisos A'; END IF;
END;
$test$;
ROLLBACK;
