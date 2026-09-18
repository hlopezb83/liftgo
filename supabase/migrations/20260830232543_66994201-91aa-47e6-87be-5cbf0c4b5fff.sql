REVOKE ALL ON FUNCTION public.customer_outstanding_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_outstanding_balance(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.customer_has_outstanding_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_has_outstanding_balance(uuid) TO service_role;