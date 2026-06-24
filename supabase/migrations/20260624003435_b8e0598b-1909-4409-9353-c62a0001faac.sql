
-- RLS policies for supplier-bill-cfdi-xml bucket
CREATE POLICY "Authenticated read supplier-bill-cfdi-xml"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'supplier-bill-cfdi-xml');

CREATE POLICY "Admin/Administrativo insert supplier-bill-cfdi-xml"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo'))
);

CREATE POLICY "Admin/Administrativo update supplier-bill-cfdi-xml"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo'))
);

CREATE POLICY "Admin/Administrativo delete supplier-bill-cfdi-xml"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'administrativo'))
);
