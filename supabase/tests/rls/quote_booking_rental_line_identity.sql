-- 0087: the server persists which accepted rental line produced each booking.
-- Both organizations and all rows are rolled back by the SQL suite runner.
BEGIN;

INSERT INTO public.organizations (id, name, slug) VALUES
  ('87000000-0000-4000-8000-0000000000a0', 'LiftGo Norte 0087', 'quote-line-a-0087'),
  ('87000000-0000-4000-8000-0000000000b0', 'LiftGo Bajío 0087', 'quote-line-b-0087');

SELECT set_config('app.organization_id', '87000000-0000-4000-8000-0000000000a0', true);
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('87000000-0000-4000-8000-0000000000a1', 'quotes-0087-a@test.local', now(), now());
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('87000000-0000-4000-8000-0000000000a0', '87000000-0000-4000-8000-0000000000a1', 'internal');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('87000000-0000-4000-8000-0000000000a1', 'admin');
INSERT INTO public.customers (id, name, created_by_organization_id) VALUES
  ('87000000-0000-4000-8000-0000000000a2', 'Aceros del Norte', '87000000-0000-4000-8000-0000000000a0');
INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
  ('87000000-0000-4000-8000-0000000000a0', '87000000-0000-4000-8000-0000000000a2');
INSERT INTO public.equipment_models (id, manufacturer, model, organization_id) VALUES
  ('87000000-0000-4000-8000-0000000000a3', 'Toyota', '8FGU25', '87000000-0000-4000-8000-0000000000a0');
INSERT INTO public.forklifts (id, name, model, equipment_model_id, status, organization_id) VALUES
  ('87000000-0000-4000-8000-0000000000a5', 'LG-N-0087-01', '8FGU25', '87000000-0000-4000-8000-0000000000a3', 'available', '87000000-0000-4000-8000-0000000000a0'),
  ('87000000-0000-4000-8000-0000000000a6', 'LG-N-0087-02', '8FGU25', '87000000-0000-4000-8000-0000000000a3', 'available', '87000000-0000-4000-8000-0000000000a0'),
  ('87000000-0000-4000-8000-0000000000a7', 'LG-N-0087-03', '8FGU25', '87000000-0000-4000-8000-0000000000a3', 'available', '87000000-0000-4000-8000-0000000000a0');
INSERT INTO public.quotes (
  id, quote_number, customer_id, customer_name, status, quote_type,
  start_date, end_date, valid_until, rental_meta, organization_id
) VALUES (
  '87000000-0000-4000-8000-0000000000a4', 'QUO-0087-A',
  '87000000-0000-4000-8000-0000000000a2', 'Aceros del Norte',
  'draft', 'rental', current_date + 30, current_date + 31, current_date + 14,
  jsonb_build_array(
    jsonb_build_object('modelId', '87000000-0000-4000-8000-0000000000a3',
                       'quantity', 1, 'dailyRate', 100, 'weeklyRate', 600,
                       'monthlyRate', 1800, 'discount', 10),
    jsonb_build_object('modelId', '87000000-0000-4000-8000-0000000000a3',
                       'quantity', 1, 'dailyRate', 200, 'weeklyRate', 1200,
                       'monthlyRate', 3600, 'discount', 20)
  ),
  '87000000-0000-4000-8000-0000000000a0'
);
INSERT INTO public.quotes (
  id, quote_number, customer_id, customer_name, status, quote_type,
  start_date, end_date, valid_until, rental_meta, organization_id
) VALUES (
  '87000000-0000-4000-8000-0000000000a8', 'QUO-0087-INVALID',
  '87000000-0000-4000-8000-0000000000a2', 'Aceros del Norte',
  'draft', 'rental', current_date + 30, current_date + 31, current_date + 14,
  jsonb_build_array(jsonb_build_object(
    'modelId', '87000000-0000-4000-8000-0000000000a3', 'quantity', 1,
    'dailyRate', 'NaN', 'weeklyRate', 600, 'monthlyRate', 1800
  )),
  '87000000-0000-4000-8000-0000000000a0'
);
UPDATE public.quotes SET status = 'sent' WHERE organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid AND status='draft';
UPDATE public.quotes SET status = 'accepted'
WHERE id IN ('87000000-0000-4000-8000-0000000000a4',
             '87000000-0000-4000-8000-0000000000a8');

SELECT set_config('app.organization_id', '87000000-0000-4000-8000-0000000000b0', true);
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('87000000-0000-4000-8000-0000000000b1', 'quotes-0087-b@test.local', now(), now());
INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('87000000-0000-4000-8000-0000000000b0', '87000000-0000-4000-8000-0000000000b1', 'internal');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('87000000-0000-4000-8000-0000000000b1', 'admin');
INSERT INTO public.customers (id, name, created_by_organization_id) VALUES
  ('87000000-0000-4000-8000-0000000000b2', 'Logística del Bajío', '87000000-0000-4000-8000-0000000000b0');
INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
  ('87000000-0000-4000-8000-0000000000b0', '87000000-0000-4000-8000-0000000000b2');
INSERT INTO public.equipment_models (id, manufacturer, model, organization_id) VALUES
  ('87000000-0000-4000-8000-0000000000b3', 'Hyster', 'H50FT', '87000000-0000-4000-8000-0000000000b0');
INSERT INTO public.forklifts (id, name, model, equipment_model_id, status, organization_id) VALUES
  ('87000000-0000-4000-8000-0000000000b5', 'LG-B-0087-01', 'H50FT', '87000000-0000-4000-8000-0000000000b3', 'available', '87000000-0000-4000-8000-0000000000b0');
INSERT INTO public.quotes (
  id, quote_number, customer_id, customer_name, status, quote_type,
  start_date, end_date, valid_until, rental_meta, organization_id
) VALUES (
  '87000000-0000-4000-8000-0000000000b4', 'QUO-0087-B',
  '87000000-0000-4000-8000-0000000000b2', 'Logística del Bajío',
  'draft', 'rental', current_date + 30, current_date + 31, current_date + 14,
  jsonb_build_array(jsonb_build_object(
    'modelId', '87000000-0000-4000-8000-0000000000b3', 'quantity', 1,
    'dailyRate', 150, 'weeklyRate', 900, 'monthlyRate', 2700
  )),
  '87000000-0000-4000-8000-0000000000b0'
);
UPDATE public.quotes SET status = 'sent' WHERE organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid AND status='draft';
UPDATE public.quotes SET status = 'accepted'
WHERE id = '87000000-0000-4000-8000-0000000000b4';

SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO
  '{"sub":"87000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT set_config('app.organization_id', '87000000-0000-4000-8000-0000000000a0', true);

DO $$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    PERFORM public.convert_quote_to_bookings_scoped(
      '87000000-0000-4000-8000-0000000000b4',
      '[{"forklift_id":"87000000-0000-4000-8000-0000000000b5"}]', false
    );
    RAISE EXCEPTION 'El usuario A convirtió la cotización B';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;

  PERFORM public.convert_quote_to_bookings_scoped(
    '87000000-0000-4000-8000-0000000000a4',
    '[{"forklift_id":"87000000-0000-4000-8000-0000000000a5"},
      {"forklift_id":"87000000-0000-4000-8000-0000000000a6"}]', false
  );
  SELECT count(*) INTO v_rows
  FROM public.bookings b
  WHERE b.quote_id = '87000000-0000-4000-8000-0000000000a4'
    AND ((b.forklift_id = '87000000-0000-4000-8000-0000000000a5'
          AND b.quote_rental_line_index = 0 AND b.daily_rate = 100
          AND b.weekly_rate = 600 AND b.monthly_rate = 1800)
      OR (b.forklift_id = '87000000-0000-4000-8000-0000000000a6'
          AND b.quote_rental_line_index = 1 AND b.daily_rate = 200
          AND b.weekly_rate = 1200 AND b.monthly_rate = 3600));
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'Dos líneas del mismo modelo perdieron su identidad o tarifas';
  END IF;

  BEGIN
    PERFORM public.convert_quote_to_bookings_scoped(
      '87000000-0000-4000-8000-0000000000a8',
      '[{"forklift_id":"87000000-0000-4000-8000-0000000000a7"}]', false
    );
    RAISE EXCEPTION 'Se aceptó una tarifa NaN en rental_meta';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'La partida de renta contiene%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.bookings
             WHERE quote_id = '87000000-0000-4000-8000-0000000000a8') THEN
    RAISE EXCEPTION 'La tarifa inválida dejó una reserva parcial';
  END IF;
END $$;

SET LOCAL request.jwt.claims TO
  '{"sub":"87000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
SELECT set_config('app.organization_id', '87000000-0000-4000-8000-0000000000b0', true);
DO $$
BEGIN
  PERFORM public.convert_quote_to_bookings_scoped(
    '87000000-0000-4000-8000-0000000000b4',
    '[{"forklift_id":"87000000-0000-4000-8000-0000000000b5"}]', false
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE quote_id = '87000000-0000-4000-8000-0000000000b4'
      AND quote_rental_line_index = 0 AND daily_rate = 150
      AND organization_id = '87000000-0000-4000-8000-0000000000b0'
  ) THEN
    RAISE EXCEPTION 'La conversión válida de B no conservó su propia partida';
  END IF;
END $$;

-- Exercise the immutable-identity trigger itself, independent of any RLS grant.
RESET ROLE;
DO $$
BEGIN
  BEGIN
    UPDATE public.bookings SET quote_rental_line_index = 1
    WHERE forklift_id = '87000000-0000-4000-8000-0000000000a5';
    RAISE EXCEPTION 'La identidad de partida pudo reescribirse';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE 'La identidad de la partida%' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE forklift_id = '87000000-0000-4000-8000-0000000000a5'
      AND quote_rental_line_index = 0
  ) THEN
    RAISE EXCEPTION 'El intento de UPDATE modificó la partida original';
  END IF;
END $$;

ROLLBACK;
