-- R6 A2-3: lotes de pago abandonados dejaban supplier_bills bloqueadas con
-- payment_in_progress_at sin ruta de liberacion.

-- 1) Red de seguridad: al borrar un lote (por cualquier via), liberar las
--    facturas del lote que no tengan pagos registrados.
CREATE OR REPLACE FUNCTION public.release_bills_on_batch_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.supplier_bills b
     SET payment_in_progress_at = NULL
   WHERE b.id IN (
           SELECT i.bill_id FROM public.supplier_payment_batch_items i
            WHERE i.batch_id = OLD.id
         )
     AND b.payment_in_progress_at IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM public.supplier_payments sp WHERE sp.bill_id = b.id
         );
  RETURN OLD;
END;
$fn$;

REVOKE ALL ON FUNCTION public.release_bills_on_batch_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_release_bills_on_batch_delete ON public.supplier_payment_batches;
CREATE TRIGGER trg_release_bills_on_batch_delete
BEFORE DELETE ON public.supplier_payment_batches
FOR EACH ROW EXECUTE FUNCTION public.release_bills_on_batch_delete();

-- 2) Barrido defensivo: facturas bloqueadas hace mas de N horas cuyo lote ya
--    no existe (wizard abandonado, error de red) y sin pagos registrados.
CREATE OR REPLACE FUNCTION public.release_stale_payment_locks(p_older_than_hours integer DEFAULT 24)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := (select auth.uid());
  v_count integer := 0;
BEGIN
  IF NOT (
    public.has_role(v_user, 'admin'::app_role)
    OR public.has_role(v_user, 'administrativo'::app_role)
  ) THEN
    RAISE EXCEPTION 'No autorizado para liberar bloqueos de pago' USING ERRCODE = '42501';
  END IF;

  IF p_older_than_hours IS NULL OR p_older_than_hours < 1 THEN
    RAISE EXCEPTION 'La antigüedad mínima debe ser de al menos 1 hora'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.supplier_bills b
     SET payment_in_progress_at = NULL
   WHERE b.payment_in_progress_at IS NOT NULL
     AND b.payment_in_progress_at < now() - make_interval(hours => p_older_than_hours)
     AND NOT EXISTS (
           SELECT 1
             FROM public.supplier_payment_batch_items i
             JOIN public.supplier_payment_batches ba ON ba.id = i.batch_id
            WHERE i.bill_id = b.id
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.supplier_payments sp WHERE sp.bill_id = b.id
         );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.release_stale_payment_locks(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_stale_payment_locks(integer) TO authenticated;