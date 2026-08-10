-- H6: flag de "timbrada sin XML local". Permite que una factura cuyo CFDI ya
-- existe ante el SAT (uuid + facturapi_invoice_id persistidos) quede en un
-- estado RECUPERABLE ('stamped' + flag) cuando el reconcile agota los intentos
-- de descarga del XML, en vez de 'error'+uuid (estado imposible: cancel-cfdi
-- exige 'stamped' y stamp-cfdi exige uuid NULL).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cfdi_xml_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.invoices.cfdi_xml_pending IS
  'true = CFDI timbrado ante el SAT pero sin XML/PDF archivado en Storage (reconcile agotó reintentos). Subir el XML manualmente desde el portal de Facturapi y limpiar el flag.';
