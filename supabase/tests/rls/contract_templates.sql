-- RLS: contract_templates — plantillas legales (texto del contrato y del pagaré).
-- Todo el back-office las lee; SOLO admin/administrativo las escriben.
-- Mecánico, cliente del portal y anon no tienen acceso.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('c7000010-0000-4000-8000-000000000001', 'administrativo.ct@test.local', now(), now()),
  ('c7000010-0000-4000-8000-000000000002', 'ventas.ct@test.local', now(), now()),
  ('c7000010-0000-4000-8000-000000000003', 'mecanico.ct@test.local', now(), now()),
  ('c7000010-0000-4000-8000-000000000004', 'cliente.ct@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('c7000010-0000-4000-8000-000000000001', 'administrativo'),
  ('c7000010-0000-4000-8000-000000000002', 'ventas'),
  ('c7000010-0000-4000-8000-000000000003', 'mechanic'),
  ('c7000010-0000-4000-8000-000000000004', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.contract_templates (id, name, body_text) VALUES
  ('c7000010-0000-4000-8000-0000000000a1', 'Arrendamiento RLS', 'Cuerpo del contrato de prueba');

-- 1) anon: sin acceso.
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.contract_templates) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee contract_templates';
  END IF;
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: sin acceso a las plantillas internas.
SET LOCAL request.jwt.claims TO '{"sub":"c7000010-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.contract_templates) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee contract_templates';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a contract_templates';
END $$;

-- 3) Mecánico: fuera del alcance legal.
SET LOCAL request.jwt.claims TO '{"sub":"c7000010-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.contract_templates) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: mecanico lee contract_templates';
  END IF;
  RAISE NOTICE 'OK: mecanico sin acceso a contract_templates';
END $$;

-- 4) Ventas: lee la plantilla, pero NO puede reescribir el clausulado.
SET LOCAL request.jwt.claims TO '{"sub":"c7000010-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int; v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.contract_templates
       WHERE id = 'c7000010-0000-4000-8000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia leer contract_templates';
  END IF;

  BEGIN
    UPDATE public.contract_templates SET body_text = 'clausula alterada'
     WHERE id = 'c7000010-0000-4000-8000-0000000000a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas reescribio el clausulado del contrato';
  END IF;

  BEGIN
    INSERT INTO public.contract_templates (name, body_text)
    VALUES ('Plantilla pirata', 'texto');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: ventas creo una plantilla de contrato';
  END IF;
  RAISE NOTICE 'OK: ventas es de solo lectura en contract_templates';
END $$;

-- 5) Administrativo: acceso completo.
SET LOCAL request.jwt.claims TO '{"sub":"c7000010-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  UPDATE public.contract_templates SET pagare_text = 'Texto de pagare'
   WHERE id = 'c7000010-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: administrativo deberia poder editar contract_templates';
  END IF;
  RAISE NOTICE 'OK: administrativo administra contract_templates';
END $$;

ROLLBACK;
