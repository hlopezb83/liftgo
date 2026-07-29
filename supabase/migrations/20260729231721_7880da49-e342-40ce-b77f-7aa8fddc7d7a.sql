-- DB4-06 (residual sat_flow, MEDIO): segunda barrera de grants, patron DB3-05.
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'invoices'
     AND column_name NOT IN (
       'cfdi_uuid', 'cfdi_status', 'cancellation_status',
       'cancellation_motive', 'facturapi_invoice_id'
     );

  EXECUTE 'REVOKE UPDATE ON public.invoices FROM authenticated';
  EXECUTE format('GRANT UPDATE (%s) ON public.invoices TO authenticated', v_cols);
END $$;

COMMENT ON TABLE public.invoices IS 'DB4-06: UPDATE columnar. Toda columna nueva requiere GRANT UPDATE (col) TO authenticated explicito; las columnas fiscales se excluyen a proposito.';