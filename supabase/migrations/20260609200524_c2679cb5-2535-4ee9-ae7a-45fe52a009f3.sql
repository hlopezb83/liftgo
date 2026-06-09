
CREATE POLICY "Customers upload own proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = public.get_customer_id_for_user(auth.uid())::text
);

CREATE POLICY "Customers read own proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    (storage.foldername(name))[1] = public.get_customer_id_for_user(auth.uid())::text
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'administrativo')
  )
);
