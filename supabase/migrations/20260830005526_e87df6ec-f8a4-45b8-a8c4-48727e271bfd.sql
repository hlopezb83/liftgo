REVOKE ALL ON FUNCTION public.customer_has_active_bookings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_has_active_bookings(uuid) TO service_role;