-- R8 Bloque 6 · #6b: índice único parcial de RFC en customers.
-- Duplicado histórico detectado: dos filas "TECNOLOGIAS EN EXTRUSION" con RFC
-- TEX180910JD1. La fila del 2026-06-26 no tiene reservas ni facturas; se archiva
-- (soft-delete) para permitir la creación del índice. La del 2026-06-30 mantiene
-- las dependencias.
UPDATE public.customers
SET deleted_at = now()
WHERE id = '63686b20-28eb-4764-97bd-09a72d89817c'
  AND deleted_at IS NULL;

-- Índice único parcial: excluye vacíos, el RFC genérico "Público en General"
-- (XAXX010101000, que por diseño puede repetirse) y clientes archivados.
CREATE UNIQUE INDEX IF NOT EXISTS customers_rfc_unique
  ON public.customers (upper(rfc))
  WHERE rfc IS NOT NULL
    AND rfc <> ''
    AND upper(rfc) <> 'XAXX010101000'
    AND deleted_at IS NULL;