-- FIX-3 (ronda 2): vincular los pagos de proveedor con el lote que los generó.
ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS batch_id uuid
    REFERENCES public.supplier_payment_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS supplier_payments_batch_idx
  ON public.supplier_payments (batch_id) WHERE batch_id IS NOT NULL;

-- Backfill aproximado: pagos creados durante/después del lote sobre una
-- factura del lote se marcan como del lote más reciente que los contiene.
UPDATE public.supplier_payments sp
   SET batch_id = sub.batch_id
  FROM (
    SELECT DISTINCT ON (sp2.id) sp2.id AS payment_id, i.batch_id
      FROM public.supplier_payments sp2
      JOIN public.supplier_payment_batch_items i ON i.bill_id = sp2.bill_id
      JOIN public.supplier_payment_batches ba ON ba.id = i.batch_id
     WHERE sp2.created_at >= ba.created_at
     ORDER BY sp2.id, ba.created_at DESC
  ) sub
 WHERE sp.id = sub.payment_id
   AND sp.batch_id IS NULL;

-- cancel_supplier_payment_batch: bloquear SOLO por pagos del propio lote.
CREATE OR REPLACE FUNCTION public.cancel_supplier_payment_batch(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user uuid := (select auth.uid());
BEGIN
  IF NOT (public.has_role(v_user, 'admin'::app_role) OR public.has_role(v_user, 'administrativo'::app_role)) THEN
    RAISE EXCEPTION 'No autorizado para cancelar lotes de pago' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.supplier_payment_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de pago no encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- FIX-3: sólo bloquean los pagos registrados POR ESTE lote (batch_id),
  -- no cualquier pago histórico de la factura.
  IF EXISTS (
    SELECT 1 FROM public.supplier_payments sp
     WHERE sp.batch_id = p_batch_id
  ) THEN
    RAISE EXCEPTION 'El lote ya tiene pagos registrados; no se puede cancelar'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.supplier_bills
     SET payment_in_progress_at = NULL
   WHERE id IN (SELECT bill_id FROM public.supplier_payment_batch_items WHERE batch_id = p_batch_id);

  DELETE FROM public.supplier_payment_batch_items WHERE batch_id = p_batch_id;
  DELETE FROM public.supplier_payment_batches WHERE id = p_batch_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cancel_supplier_payment_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_payment_batch(uuid) TO authenticated;

-- releasable_payment_locks: sólo los pagos DE UN LOTE vigente protegen el
-- bloqueo. Un pago ajeno (abono parcial previo) ya no lo deja permanente.
CREATE OR REPLACE FUNCTION public.releasable_payment_locks(p_older_than_hours integer DEFAULT 24)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT b.id
    FROM public.supplier_bills b
   WHERE b.payment_in_progress_at IS NOT NULL
     AND b.payment_in_progress_at < now() - make_interval(hours => GREATEST(COALESCE(p_older_than_hours, 24), 1))
     AND NOT EXISTS (
           SELECT 1 FROM public.supplier_payments sp
            WHERE sp.bill_id = b.id AND sp.batch_id IS NOT NULL
         )
     -- Lote "estancado": ningun lote que contenga la factura tiene pagos
     -- registrados POR ESE LOTE para alguna de sus facturas.
     AND NOT EXISTS (
           SELECT 1
             FROM public.supplier_payment_batch_items i
             JOIN public.supplier_payments sp2 ON sp2.batch_id = i.batch_id
            WHERE i.bill_id = b.id
         );
$fn$;

REVOKE ALL ON FUNCTION public.releasable_payment_locks(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.releasable_payment_locks(integer) TO authenticated;