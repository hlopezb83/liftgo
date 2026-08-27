-- R5-19: whitelist de MIME types para payment-proofs aplicada en la policy de
-- INSERT (storage.buckets no se modifica por migracion). Alineada con la
-- whitelist del cliente (useCreatePaymentIntent). El limite de tamano se
-- administra a nivel bucket.
DROP POLICY IF EXISTS "Customers upload own proofs" ON storage.objects;
CREATE POLICY "Customers upload own proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = public.get_customer_id_for_user((select auth.uid()))::text
  AND coalesce(metadata->>'mimetype', 'application/pdf') IN (
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp'
  )
);