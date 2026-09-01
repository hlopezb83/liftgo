-- R8-13: decisión de privilegios explícita e idempotente.
-- La autoridad es el camino SECURITY DEFINER (count_releasable_payment_locks /
-- release_stale_payment_locks); la función interna no se ejecuta directo.
REVOKE ALL ON FUNCTION public.releasable_payment_locks(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.releasable_payment_locks(integer) FROM anon;
REVOKE ALL ON FUNCTION public.releasable_payment_locks(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.releasable_payment_locks(integer) TO service_role;

REVOKE ALL ON FUNCTION public.count_releasable_payment_locks(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_releasable_payment_locks(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_releasable_payment_locks(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_releasable_payment_locks(integer) TO service_role;

COMMENT ON FUNCTION public.releasable_payment_locks(integer) IS
  'R8-13: uso interno. Sin EXECUTE para anon/authenticated; acceder via count_releasable_payment_locks / release_stale_payment_locks.';

-- R8-14: normalizador canónico de régimen fiscal (espejo SQL de
-- normalizeRegimenFiscal en supabase/functions/_shared/regimenFiscal.ts).
CREATE OR REPLACE FUNCTION public.normalize_regimen_fiscal(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN substring(btrim(coalesce(p_value, '')) from '^([0-9]{3})(?![0-9])') IN (
      '601','603','605','606','607','608','609','610','611','612','614','615',
      '616','620','621','622','623','624','625','626','628','629','630'
    )
    THEN substring(btrim(p_value) from '^([0-9]{3})(?![0-9])')
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.normalize_regimen_fiscal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_regimen_fiscal(text) TO authenticated, service_role;

-- Reparación fail-safe: SOLO borradores sin timbrar, con prefijo determinista
-- de un código soportado. Ambiguos y documentos fiscales vivos quedan intactos.
UPDATE public.invoices i
   SET receptor_regimen_fiscal = public.normalize_regimen_fiscal(i.receptor_regimen_fiscal)
 WHERE i.status = 'draft'
   AND i.cfdi_uuid IS NULL
   AND coalesce(i.cfdi_status, '') NOT IN ('stamped', 'cancelled')
   AND i.receptor_regimen_fiscal IS NOT NULL
   AND btrim(i.receptor_regimen_fiscal) <> ''
   AND public.normalize_regimen_fiscal(i.receptor_regimen_fiscal) IS NOT NULL
   AND i.receptor_regimen_fiscal IS DISTINCT FROM
       public.normalize_regimen_fiscal(i.receptor_regimen_fiscal);