
-- Lote A: políticas explícitas para bucket cfdi-files
CREATE POLICY "Admins write cfdi-files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cfdi-files'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
);

CREATE POLICY "Admins update cfdi-files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'cfdi-files'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
)
WITH CHECK (
  bucket_id = 'cfdi-files'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
);

CREATE POLICY "Admins delete cfdi-files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'cfdi-files'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
);

-- Lote B: REVOKE EXECUTE de authenticated/PUBLIC en funciones SECURITY DEFINER
-- usadas únicamente por triggers o helpers internos (nunca invocadas desde el cliente).
-- Los triggers ejecutan estas funciones como dueño de la tabla, así que no necesitan
-- privilegio EXECUTE para los roles regulares. service_role conserva acceso.

REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_part_usage() FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_activity() FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_prospect_created_by() FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_costo_venta_on_forklift_update() FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_feedback_number() FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, text, uuid) FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, text, uuid) FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_payment_received() FROM authenticated, PUBLIC;
