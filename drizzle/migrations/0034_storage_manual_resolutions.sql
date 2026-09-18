-- 0034_storage_manual_resolutions
--
-- Cierre operativo de la cuarentena del traslado historico de Storage.
--
-- Los objetos sin dueno derivable quedan en "lista de resolucion manual".
-- Esta migracion crea el registro durable de esas decisiones humanas. La tabla
-- es deny-all para `anon` y `authenticated`: solo `service_role` (operador
-- autorizado, entorno privado) puede leerla o escribirla. Registrar una fila
-- NO autoriza la copia por si sola: el migrador revalida dueno y organizacion
-- activa justo antes de copiar y falla cerrado ante cualquier discrepancia.

CREATE TABLE IF NOT EXISTS public.storage_migration_manual_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  resolved_by TEXT NOT NULL,
  justification TEXT NOT NULL,
  evidence TEXT,
  revalidated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT storage_manual_resolution_status_chk
    CHECK (status IN ('active', 'revoked')),
  CONSTRAINT storage_manual_resolution_justification_chk
    CHECK (length(btrim(justification)) >= 10),
  CONSTRAINT storage_manual_resolution_identity_uidx
    UNIQUE (bucket_id, source_path)
);

-- Solo service_role. Ningun grant a anon/authenticated: la lista contiene
-- rutas de objetos y no debe ser legible desde la aplicacion.
GRANT ALL ON public.storage_migration_manual_resolutions TO service_role;

ALTER TABLE public.storage_migration_manual_resolutions
  ENABLE ROW LEVEL SECURITY;

-- Deny-all explicito: las policies existen para dejar la intencion escrita.
DROP POLICY IF EXISTS storage_manual_resolutions_deny_all
  ON public.storage_migration_manual_resolutions;
CREATE POLICY storage_manual_resolutions_deny_all
  ON public.storage_migration_manual_resolutions
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
