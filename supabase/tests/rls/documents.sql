-- RLS: documents — el mecánico solo ve documentos de equipo/mantenimiento; cliente del portal no ve nada.
-- FIX-R2-04: chequeo de BREACH fuera del handler (ver invoices.sql).
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'mecanico.doc@test.local', now(), now()),
  ('cccccccc-0000-4000-8000-000000000002', 'cliente.doc@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'mechanic'),
  ('cccccccc-0000-4000-8000-000000000002', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.documents (id, entity_type, entity_id, file_name, file_url) VALUES
  ('cccccccc-0000-4000-8000-00000000000a', 'forklift', gen_random_uuid(), 'manual.pdf', 'docs/manual.pdf'),
  ('cccccccc-0000-4000-8000-00000000000b', 'invoice', gen_random_uuid(), 'factura.pdf', 'docs/factura.pdf');

SET LOCAL role = 'authenticated';

-- 1) Mecánico: solo documentos de equipo/mantenimiento.
SET LOCAL request.jwt.claims TO '{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.documents WHERE entity_type = 'invoice') THEN
    RAISE EXCEPTION 'RLS BREACH: mecánico ve documentos de facturación';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.documents WHERE entity_type = 'forklift') THEN
    RAISE EXCEPTION 'RLS ROTA: mecánico no ve documentos de equipo';
  END IF;

  BEGIN
    DELETE FROM public.documents WHERE entity_type = 'forklift';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- denegación esperada; el efecto se verifica abajo
  END;
  IF NOT EXISTS (SELECT 1 FROM public.documents
                  WHERE id = 'cccccccc-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'RLS BREACH: mecánico borró documentos';
  END IF;
  RAISE NOTICE 'OK: mecánico es de solo lectura en documents';
END $$;

-- 2) Cliente del portal: sin acceso al repositorio interno.
SET LOCAL request.jwt.claims TO '{"sub":"cccccccc-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.documents) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee documents';
  END IF;
END $$;

ROLLBACK;
