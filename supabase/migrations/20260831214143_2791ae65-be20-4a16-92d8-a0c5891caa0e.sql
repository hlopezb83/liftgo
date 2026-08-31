-- Las funciones de trigger no deben ser invocables desde la API.
REVOKE EXECUTE ON FUNCTION public.rebound_quote_on_booking_cancel() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_damage_on_invoice_cancel() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_transition() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_quote_acceptance() FROM PUBLIC, anon, authenticated;