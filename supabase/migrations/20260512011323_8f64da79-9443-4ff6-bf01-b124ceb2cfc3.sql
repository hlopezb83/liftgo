
-- 1. Billing secrets table (admin/administrativo only)
CREATE TABLE IF NOT EXISTS public.billing_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facturapi_test_key text,
  facturapi_live_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access billing_secrets"
  ON public.billing_secrets FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Administrativo full access billing_secrets"
  ON public.billing_secrets FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrativo'::app_role));

-- Migrate existing keys from company_settings (single row expected)
INSERT INTO public.billing_secrets (facturapi_test_key, facturapi_live_key)
SELECT facturapi_test_key, facturapi_live_key
FROM public.company_settings
LIMIT 1
ON CONFLICT DO NOTHING;

-- Drop sensitive columns from company_settings
ALTER TABLE public.company_settings DROP COLUMN IF EXISTS facturapi_test_key;
ALTER TABLE public.company_settings DROP COLUMN IF EXISTS facturapi_live_key;

-- 2. documents storage bucket: keep public read, restrict writes
DROP POLICY IF EXISTS "Public upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Public delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Public update documents" ON storage.objects;

CREATE POLICY "Authenticated upload documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Authenticated delete documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "Authenticated update documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents');

-- 3. rate_limits: explicit deny for authenticated/anon (only service_role can use it)
-- RLS already enabled with no policies = denied by default; add explicit no-op policy
-- to silence linter and make intent clear.
DROP POLICY IF EXISTS "No client access to rate_limits" ON public.rate_limits;
CREATE POLICY "No client access to rate_limits"
  ON public.rate_limits FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);
