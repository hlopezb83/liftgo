-- R9-03: la reparación de R8-14 sólo cubría status='draft', pero existen
-- facturas 'sent' / 'partial' / 'paid' sin timbrar (cfdi_uuid IS NULL) que
-- siguen siendo fiscalmente mutables y timbrables. El predicado correcto es el
-- estado de emisión fiscal, no el estatus de negocio.
--
-- Universo seguro (mutable, sin evidencia fiscal emitida):
--   cfdi_uuid IS NULL
--   AND coalesce(cfdi_status,'') NOT IN ('stamped','cancelled')
--   AND coalesce(status,'')      <> 'cancelled'
--   AND cancellation_status IS NULL
-- Se excluye 'cancelled' aunque no tenga UUID: es evidencia congelada.
-- Se reutiliza public.normalize_regimen_fiscal(text); no se duplica el
-- catálogo SAT. Sólo se escribe cuando la normalización es determinista
-- (devuelve un código soportado) y realmente cambia el valor: los ambiguos
-- quedan intactos. Idempotente por construcción.
UPDATE public.invoices i
   SET receptor_regimen_fiscal = public.normalize_regimen_fiscal(i.receptor_regimen_fiscal)
 WHERE i.cfdi_uuid IS NULL
   AND coalesce(i.cfdi_status, '') NOT IN ('stamped', 'cancelled')
   AND coalesce(i.status, '') <> 'cancelled'
   AND i.cancellation_status IS NULL
   AND i.receptor_regimen_fiscal IS NOT NULL
   AND btrim(i.receptor_regimen_fiscal) <> ''
   AND public.normalize_regimen_fiscal(i.receptor_regimen_fiscal) IS NOT NULL
   AND i.receptor_regimen_fiscal IS DISTINCT FROM
       public.normalize_regimen_fiscal(i.receptor_regimen_fiscal);

COMMENT ON FUNCTION public.normalize_regimen_fiscal(text) IS
  'R8-14/R9-03: normalizador canónico de régimen fiscal (espejo SQL de normalizeRegimenFiscal). Devuelve NULL si el valor es ambiguo. Reparaciones de datos sólo sobre facturas sin cfdi_uuid, no timbradas y no canceladas.';
