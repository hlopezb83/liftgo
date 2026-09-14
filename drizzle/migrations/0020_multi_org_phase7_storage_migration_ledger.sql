-- =====================================================================
-- Multi-organización · Fase 7.1 (ledger de migración de Storage)
--
-- Este cambio NO mueve objetos. Sólo crea la bitácora idempotente que usa la
-- función administrativa para el flujo seguro:
--   copiar objeto → actualizar referencias → verificar → borrar origen.
-- Las rutas y URLs legadas no se replican en el ledger: se guarda el path del
-- objeto, el formato de referencia y un SHA-256 del valor original.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.storage_object_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  source_path text NOT NULL,
  destination_path text NOT NULL,
  discovery_kind text NOT NULL DEFAULT 'referenced'
    CHECK (discovery_kind IN ('referenced', 'orphaned')),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN (
      'planned',
      'copied',
      'references_updated',
      'source_deleted',
      'skipped',
      'failed'
    )),
  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  last_error_code text,
  copied_at timestamptz,
  references_updated_at timestamptz,
  source_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_object_migrations_supported_bucket_check CHECK (
    bucket_id IN (
      'cfdi-files',
      'documents',
      'feedback-screenshots',
      'payment-proofs',
      'supplier-bill-cfdi-xml',
      'supplier-payment-receipts'
    )
  ),
  CONSTRAINT storage_object_migrations_safe_paths_check CHECK (
    source_path !~ '^/'
    AND destination_path !~ '^/'
    AND source_path <> destination_path
  ),
  CONSTRAINT storage_object_migrations_source_unique UNIQUE (bucket_id, source_path),
  CONSTRAINT storage_object_migrations_destination_unique
    UNIQUE (bucket_id, destination_path)
);

CREATE TABLE IF NOT EXISTS public.storage_reference_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id uuid NOT NULL
    REFERENCES public.storage_object_migrations(id) ON DELETE RESTRICT,
  reference_table text NOT NULL,
  reference_id uuid NOT NULL,
  reference_column text NOT NULL,
  source_value_sha256 text NOT NULL
    CHECK (source_value_sha256 ~ '^[0-9a-f]{64}$'),
  value_format text NOT NULL
    CHECK (value_format IN ('storage_path', 'bucket_path', 'public_url')),
  public_url_origin text,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'updated', 'skipped', 'failed')),
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_reference_migrations_origin_check CHECK (
    (value_format = 'public_url' AND public_url_origin IS NOT NULL)
    OR (value_format <> 'public_url' AND public_url_origin IS NULL)
  ),
  CONSTRAINT storage_reference_migrations_unique
    UNIQUE (migration_id, reference_table, reference_id, reference_column)
);

CREATE INDEX IF NOT EXISTS storage_object_migrations_pending_idx
  ON public.storage_object_migrations (status, created_at)
  WHERE status IN ('planned', 'copied', 'references_updated', 'failed');

CREATE INDEX IF NOT EXISTS storage_reference_migrations_pending_idx
  ON public.storage_reference_migrations (migration_id, status);

ALTER TABLE public.storage_object_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_reference_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.storage_object_migrations FROM anon, authenticated;
REVOKE ALL ON TABLE public.storage_reference_migrations FROM anon, authenticated;

DO $phase7_storage_ledger_assertions$
BEGIN
  IF to_regclass('public.storage_object_migrations') IS NULL
     OR to_regclass('public.storage_reference_migrations') IS NULL THEN
    RAISE EXCEPTION 'El ledger de migración de Storage no fue creado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'storage_object_migrations_source_unique'
  ) THEN
    RAISE EXCEPTION 'El ledger debe impedir duplicar un objeto origen';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'storage_reference_migrations_unique'
  ) THEN
    RAISE EXCEPTION 'El ledger debe impedir duplicar una referencia';
  END IF;
END;
$phase7_storage_ledger_assertions$;
