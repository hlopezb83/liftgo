-- ============================================================
-- Soft Delete: 5 tablas (forklifts, customers, suppliers, maintenance_logs, damage_records)
-- ============================================================

-- 1) Columnas deleted_at / deleted_by
ALTER TABLE public.forklifts        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
ALTER TABLE public.customers        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
ALTER TABLE public.suppliers        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
ALTER TABLE public.damage_records   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- 2) Reemplazar UNIQUE constraints por versiones parciales (ignoran soft-deleted)
DROP INDEX IF EXISTS public.forklifts_name_unique;
CREATE UNIQUE INDEX forklifts_name_unique
  ON public.forklifts (name)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.forklifts_serial_number_unique;
CREATE UNIQUE INDEX forklifts_serial_number_unique
  ON public.forklifts (serial_number)
  WHERE serial_number IS NOT NULL AND deleted_at IS NULL;

DROP INDEX IF EXISTS public.suppliers_rfc_unique_idx;
CREATE UNIQUE INDEX suppliers_rfc_unique_idx
  ON public.suppliers (upper(btrim(rfc)))
  WHERE rfc IS NOT NULL AND btrim(rfc) <> '' AND deleted_at IS NULL;

-- 3) Índices parciales para filtros frecuentes (registros activos)
CREATE INDEX IF NOT EXISTS idx_forklifts_active        ON public.forklifts (id)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_active        ON public.customers (id)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_active        ON public.suppliers (id)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_active ON public.maintenance_logs (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_damage_records_active   ON public.damage_records (id)   WHERE deleted_at IS NULL;

-- 4) Comentarios documentando la convención
COMMENT ON COLUMN public.forklifts.deleted_at        IS 'Soft delete timestamp. NULL = activo. Filtrar en lecturas con .is(deleted_at, null).';
COMMENT ON COLUMN public.customers.deleted_at        IS 'Soft delete timestamp. NULL = activo.';
COMMENT ON COLUMN public.suppliers.deleted_at        IS 'Soft delete timestamp. NULL = activo.';
COMMENT ON COLUMN public.maintenance_logs.deleted_at IS 'Soft delete timestamp. NULL = activo.';
COMMENT ON COLUMN public.damage_records.deleted_at   IS 'Soft delete timestamp. NULL = activo.';