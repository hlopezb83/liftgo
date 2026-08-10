-- RLS: company_settings — datos fiscales del emisor: staff lee, solo admin/administrativo edita.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'ventas.cfg@test.local', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'cliente.cfg@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'ventas'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'customer')
ON CONFLICT DO NOTHING;

INSERT INTO public.company_settings (id, razon_social, rfc, regimen_fiscal, lugar_expedicion)
VALUES ('aaaaaaaa-0000-4000-8000-00000000000f', 'LiftGo RLS', 'AAA010101AAA', '601', '64000');

SET LOCAL role = 'authenticated';

-- 1) Ventas: lee pero no edita datos fiscales.
SET LOCAL request.jwt.claims TO '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.company_settings
                  WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000f') THEN
    RAISE EXCEPTION 'RLS ROTA: ventas no lee company_settings';
  END IF;

  BEGIN
    UPDATE public.company_settings SET rfc = 'XXX010101XXX'
     WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000f';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'RLS BREACH: ventas cambió el RFC emisor';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: ventas no edita datos fiscales';
  END;
END $$;

-- 2) Cliente del portal: sin acceso alguno.
SET LOCAL request.jwt.claims TO '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.company_settings) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee company_settings';
  END IF;
END $$;

ROLLBACK;
