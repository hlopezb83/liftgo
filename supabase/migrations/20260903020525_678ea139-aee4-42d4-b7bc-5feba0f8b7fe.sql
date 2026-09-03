-- Hardening: la función del trigger no debe ser ejecutable directamente por
-- clientes; sólo la invoca el trigger de contracts.
REVOKE EXECUTE ON FUNCTION public.enforce_one_active_contract_per_booking() FROM PUBLIC, anon, authenticated;