
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
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.audit_trigger_fn()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM authenticated, PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.handle_part_usage()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_part_usage() FROM authenticated, PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.log_activity()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.log_activity() FROM authenticated, PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.set_prospect_created_by()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.set_prospect_created_by() FROM authenticated, PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.sync_costo_venta_on_forklift_update()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.sync_costo_venta_on_forklift_update() FROM authenticated, PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.generate_feedback_number()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.generate_feedback_number() FROM authenticated, PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.create_notification(uuid, text, text, text, text, text, uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, text, uuid) FROM authenticated, PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.notify_admins(text, text, text, text, text, uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, text, uuid) FROM authenticated, PUBLIC';
  END IF;
END $lgp_guard$;
DO $lgp_guard$
BEGIN
  IF to_regprocedure('public.notify_payment_received()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.notify_payment_received() FROM authenticated, PUBLIC';
  END IF;
END $lgp_guard$;
