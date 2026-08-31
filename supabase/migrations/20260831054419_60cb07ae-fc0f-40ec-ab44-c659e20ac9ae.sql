DO $mig$
DECLARE d text; o text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_income_statement';

  -- 1) ingresos: divisa sin TC ya no se cuenta 1:1
  o := d;
  d := replace(d,
    $p1$    WHERE COALESCE(i.is_e2e, false) = false
      AND CASE$p1$,
    $p2$    WHERE COALESCE(i.is_e2e, false) = false
      -- 2A-1: factura en divisa sin tipo de cambio se excluye (antes valia 1:1).
      AND (COALESCE(i.moneda, 'MXN') = 'MXN' OR COALESCE(NULLIF(i.tipo_cambio, 0), 0) > 0)
      AND CASE$p2$);
  IF d = o THEN RAISE EXCEPTION '2A-1: patron inv no encontrado'; END IF;

  -- 2) notas de credito: mismo criterio, via factura padre
  o := d;
  d := replace(d,
    $p3$    WHERE cn.status NOT IN ('draft','cancelled')$p3$,
    $p4$    WHERE cn.status NOT IN ('draft','cancelled')
      -- 2A-1: NC de factura en divisa sin TC se excluye junto con su factura.
      AND (COALESCE(pi.moneda, 'MXN') = 'MXN' OR COALESCE(NULLIF(pi.tipo_cambio, 0), 0) > 0)$p4$);
  IF d = o THEN RAISE EXCEPTION '2A-1: patron cn_base no encontrado'; END IF;

  -- 3) gastos de proveedor: excluir rechazadas y divisa sin TC
  o := d;
  d := replace(d,
    $p5$    WHERE sb.status NOT IN ('cancelled', 'draft')
      AND sb.category IS NOT NULL$p5$,
    $p6$    WHERE sb.status NOT IN ('cancelled', 'draft')
      -- 2A-1: una factura de proveedor rechazada no es gasto reconocible.
      AND COALESCE(sb.approval_status::text, 'not_required') <> 'rejected'
      -- 2A-1: gasto en divisa sin tipo de cambio se excluye (antes valia 1:1).
      AND (COALESCE(sb.currency, 'MXN') = 'MXN' OR COALESCE(NULLIF(sb.exchange_rate, 0), 0) > 0)
      AND sb.category IS NOT NULL$p6$);
  IF d = o THEN RAISE EXCEPTION '2A-1: patron sb_base no encontrado'; END IF;

  -- 4) declarar el acumulador de documentos excluidos
  o := d;
  d := replace(d,
    $p7$  v_sold_without_cost jsonb;
BEGIN$p7$,
    $p8$  v_sold_without_cost jsonb;
  v_fx_missing jsonb;
BEGIN$p8$);
  IF d = o THEN RAISE EXCEPTION '2A-1: patron DECLARE no encontrado'; END IF;

  -- 5) exponer el conteo de excluidos por TC faltante
  o := d;
  d := replace(d,
    $p9$  RETURN jsonb_build_object(
    'months', COALESCE(v_months, '[]'::jsonb),
    'rented_without_cost', v_rented_without_cost,
    'sold_without_cost', v_sold_without_cost
  );$p9$,
    $pa$  -- 2A-1: documentos en divisa sin tipo de cambio excluidos del reporte.
  SELECT jsonb_build_object(
    'invoices', (
      SELECT COUNT(*) FROM public.invoices i
       WHERE COALESCE(i.is_e2e, false) = false
         AND i.status NOT IN ('draft','cancelled')
         AND COALESCE(i.moneda, 'MXN') <> 'MXN'
         AND COALESCE(NULLIF(i.tipo_cambio, 0), 0) = 0
         AND i.issued_at BETWEEN p_start_date AND p_end_date
    ),
    'supplier_bills', (
      SELECT COUNT(*) FROM public.supplier_bills sb
       WHERE sb.status NOT IN ('cancelled','draft')
         AND COALESCE(sb.approval_status::text, 'not_required') <> 'rejected'
         AND COALESCE(sb.currency, 'MXN') <> 'MXN'
         AND COALESCE(NULLIF(sb.exchange_rate, 0), 0) = 0
         AND sb.issue_date BETWEEN p_start_date AND p_end_date
    )
  ) INTO v_fx_missing;

  RETURN jsonb_build_object(
    'months', COALESCE(v_months, '[]'::jsonb),
    'rented_without_cost', v_rented_without_cost,
    'sold_without_cost', v_sold_without_cost,
    'fx_missing', v_fx_missing
  );$pa$);
  IF d = o THEN RAISE EXCEPTION '2A-1: patron RETURN no encontrado'; END IF;

  EXECUTE d;
END
$mig$;