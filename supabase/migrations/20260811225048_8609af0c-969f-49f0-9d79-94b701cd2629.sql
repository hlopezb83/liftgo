-- Defensa en profundidad: las funciones trigger no se pueden invocar por RPC
-- (retornan `trigger`), pero no hay razón para que figuren como ejecutables por
-- PUBLIC/anon. El disparo del trigger no evalúa EXECUTE, sólo el privilegio
-- TRIGGER sobre la tabla, así que revocar no afecta los INSERT.
-- Rollback: GRANT EXECUTE ON FUNCTION public.<fn>() TO PUBLIC;
REVOKE ALL ON FUNCTION public.set_supplier_bill_number() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_delivery_number() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_inspection_number() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_supplier_bill_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_delivery_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_inspection_number() TO service_role;
