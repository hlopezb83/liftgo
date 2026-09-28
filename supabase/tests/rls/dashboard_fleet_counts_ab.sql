-- Full-fleet aggregate: more than the 500-row client limit, with organization
-- isolation and a confirmed booking that has not yet completed delivery.
BEGIN;

INSERT INTO public.organizations (id, name, slug) VALUES
  ('72000000-0000-4000-8000-0000000000a0', 'Flota Norte', 'rls-fleet-count-a'),
  ('72000000-0000-4000-8000-0000000000b0', 'Flota Bajío', 'rls-fleet-count-b');

SELECT set_config('app.organization_id', '72000000-0000-4000-8000-0000000000a0', true);
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('72000000-0000-4000-8000-0000000000a1', 'fleet-count-a@test.local', now(), now()),
  ('72000000-0000-4000-8000-0000000000b1', 'fleet-count-b@test.local', now(), now());
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('72000000-0000-4000-8000-0000000000a0', '72000000-0000-4000-8000-0000000000a1', 'internal'),
  ('72000000-0000-4000-8000-0000000000b0', '72000000-0000-4000-8000-0000000000b1', 'internal');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('72000000-0000-4000-8000-0000000000a1', 'admin'),
  ('72000000-0000-4000-8000-0000000000b1', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.forklifts (id, name, model, status, organization_id)
SELECT gen_random_uuid(), 'A-' || lpad(n::text, 4, '0'), '8FGU25', 'available',
       '72000000-0000-4000-8000-0000000000a0'::uuid
FROM generate_series(1, 501) n;

INSERT INTO public.customers (id, name) VALUES
  ('72000000-0000-4000-8000-0000000000ac', 'Cliente de flota A');
INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
  ('72000000-0000-4000-8000-0000000000a0', '72000000-0000-4000-8000-0000000000ac');
INSERT INTO public.bookings (
  forklift_id, customer_id, start_date, end_date, booking_number, status, organization_id
)
SELECT id, '72000000-0000-4000-8000-0000000000ac'::uuid,
       public.today_mty() - 1, public.today_mty() + 1,
       'RES-A-7201', 'confirmed', '72000000-0000-4000-8000-0000000000a0'::uuid
FROM public.forklifts WHERE name = 'A-0001'
  AND organization_id = '72000000-0000-4000-8000-0000000000a0';

SELECT set_config('app.organization_id', '72000000-0000-4000-8000-0000000000b0', true);
INSERT INTO public.forklifts (id, name, model, status, organization_id) VALUES
  ('72000000-0000-4000-8000-0000000000bf', 'B-0001', '8FGU25', 'available',
   '72000000-0000-4000-8000-0000000000b0');

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"72000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $$
DECLARE v_counts jsonb;
BEGIN
  v_counts := public.get_dashboard_fleet_counts();
  IF (v_counts->>'total')::int <> 501 OR
     (v_counts->>'available')::int <> 500 OR
     (v_counts->>'rented')::int <> 1 THEN
    RAISE EXCEPTION 'Dashboard A: expected 501 total, 500 available, 1 committed; got %', v_counts;
  END IF;
END $$;

SET LOCAL request.jwt.claims TO
  '{"sub":"72000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
DO $$
DECLARE v_counts jsonb;
BEGIN
  v_counts := public.get_dashboard_fleet_counts();
  IF (v_counts->>'total')::int <> 1 OR
     (v_counts->>'available')::int <> 1 OR
     (v_counts->>'rented')::int <> 0 THEN
    RAISE EXCEPTION 'Dashboard B: expected own 1 available only; got %', v_counts;
  END IF;
END $$;

-- La recolección usa la dirección del cliente, no el destino físico. Debe
-- borrar la ubicación visible hasta que se registre un nuevo sitio.
SET LOCAL request.jwt.claims TO
  '{"sub":"72000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
INSERT INTO public.deliveries (
  forklift_id, booking_id, type, status, scheduled_date, completed_at,
  delivery_number, address, completed_no_evidence_reason, organization_id
)
SELECT b.forklift_id, b.id, 'delivery', 'completed', public.today_mty() - 1,
       now() - interval '2 hours', 'ENT-A-7201', 'Domicilio del cliente',
       'Entrega de prueba', b.organization_id
FROM public.bookings b WHERE b.booking_number = 'RES-A-7201';

DO $$
DECLARE v_location text;
BEGIN
  SELECT location INTO v_location FROM public.forklift_current_location
  WHERE forklift_id = (SELECT id FROM public.forklifts WHERE name = 'A-0001');
  IF v_location <> 'Domicilio del cliente' THEN
    RAISE EXCEPTION 'Latest delivery should show registered customer site; got %', v_location;
  END IF;
END $$;

INSERT INTO public.deliveries (
  forklift_id, booking_id, type, status, scheduled_date, completed_at,
  delivery_number, address, completed_no_evidence_reason, organization_id
)
SELECT b.forklift_id, b.id, 'pickup', 'completed', public.today_mty(),
       now() - interval '1 hour', 'REC-A-7201', 'Domicilio del cliente',
       'Recolección de prueba', b.organization_id
FROM public.bookings b WHERE b.booking_number = 'RES-A-7201';

DO $$
DECLARE v_location text;
BEGIN
  SELECT location INTO v_location FROM public.forklift_current_location
  WHERE forklift_id = (SELECT id FROM public.forklifts WHERE name = 'A-0001');
  IF v_location IS NOT NULL THEN
    RAISE EXCEPTION 'Pickup must clear stale customer address; got %', v_location;
  END IF;
END $$;

ROLLBACK;
