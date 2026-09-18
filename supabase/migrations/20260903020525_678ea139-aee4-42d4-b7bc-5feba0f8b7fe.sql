-- Hardening: la función del trigger no debe ser ejecutable directamente por
-- clientes. sólo la invoca el trigger de contracts.
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.enforce_one_active_contract_per_booking()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.enforce_one_active_contract_per_booking() FROM PUBLIC, anon, authenticated';
  END IF;
END $lgp_guard$;
