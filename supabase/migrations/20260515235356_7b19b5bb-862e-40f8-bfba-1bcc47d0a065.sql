
-- 1) billing_secrets: admin-only, explicit SELECT policy
DROP POLICY IF EXISTS "Admins delete billing_secrets" ON public.billing_secrets;
DROP POLICY IF EXISTS "Admins update billing_secrets" ON public.billing_secrets;
DROP POLICY IF EXISTS "Admins write billing_secrets" ON public.billing_secrets;

CREATE POLICY "Admins select billing_secrets"
ON public.billing_secrets FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert billing_secrets"
ON public.billing_secrets FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update billing_secrets"
ON public.billing_secrets FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete billing_secrets"
ON public.billing_secrets FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) feedback-screenshots storage: DELETE policies
CREATE POLICY "Users delete own feedback screenshots"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins delete any feedback screenshot"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
);
