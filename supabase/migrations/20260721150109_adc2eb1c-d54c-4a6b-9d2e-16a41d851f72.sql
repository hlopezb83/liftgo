-- 6.1 billing_secrets: hardening column-level SELECT
REVOKE ALL ON public.billing_secrets FROM anon;
REVOKE SELECT ON public.billing_secrets FROM authenticated;
GRANT SELECT (id, created_at, updated_at) ON public.billing_secrets TO authenticated;
GRANT INSERT (id, facturapi_test_key, facturapi_live_key, updated_at), UPDATE (facturapi_test_key, facturapi_live_key, updated_at), DELETE ON public.billing_secrets TO authenticated;
GRANT ALL ON public.billing_secrets TO service_role;

-- 6.2 customer_payment_intents: revoke anon
REVOKE ALL ON public.customer_payment_intents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payment_intents TO authenticated;
GRANT ALL ON public.customer_payment_intents TO service_role;