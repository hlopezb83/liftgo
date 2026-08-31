-- A2-9: relacion explicita gasto operativo <-> factura de proveedor
ALTER TABLE public.operating_expenses
  ADD COLUMN IF NOT EXISTS supplier_bill_id uuid
  REFERENCES public.supplier_bills(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS operating_expenses_supplier_bill_id_idx
  ON public.operating_expenses (supplier_bill_id)
  WHERE supplier_bill_id IS NOT NULL;

COMMENT ON COLUMN public.operating_expenses.supplier_bill_id IS
  'A2-9: cuando el gasto ya esta capturado como factura de proveedor, este vinculo lo excluye del estado de resultados sin depender de heuristicas de fecha/monto/descripcion.';

DO $mig$
DECLARE d text; o text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_income_statement';
  o := d;
  d := replace(d,
    E'    WHERE d.date_key IS NULL\n  ),',
    E'    WHERE d.date_key IS NULL\n      AND oe.supplier_bill_id IS NULL\n  ),');
  IF d = o THEN RAISE EXCEPTION 'get_income_statement: patron oe_dedup no encontrado'; END IF;
  EXECUTE d;
END
$mig$;