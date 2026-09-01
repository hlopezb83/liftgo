-- R9-03 (fix de predicado): cancellation_status usa el sentinela 'none', no NULL.
-- El universo seguro es: sin folio fiscal, no timbrada, no cancelada.
UPDATE public.invoices i
   SET receptor_regimen_fiscal = public.normalize_regimen_fiscal(i.receptor_regimen_fiscal)
 WHERE i.cfdi_uuid IS NULL
   AND coalesce(i.cfdi_status, '') NOT IN ('stamped', 'cancelled')
   AND coalesce(i.status, '') <> 'cancelled'
   AND coalesce(i.cancellation_status, 'none') IN ('none', '')
   AND i.receptor_regimen_fiscal IS NOT NULL
   AND btrim(i.receptor_regimen_fiscal) <> ''
   AND public.normalize_regimen_fiscal(i.receptor_regimen_fiscal) IS NOT NULL
   AND i.receptor_regimen_fiscal IS DISTINCT FROM
       public.normalize_regimen_fiscal(i.receptor_regimen_fiscal);
