
REVOKE EXECUTE ON FUNCTION public.check_and_record_rate_limit(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_rate_limit(TEXT, TEXT, INT, INT) TO service_role;
