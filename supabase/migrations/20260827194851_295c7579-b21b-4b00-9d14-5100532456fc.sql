-- v7.362.0 — A3/A4: normalización de moneda en reportes financieros.
--
-- A3: get_income_statement convertía el INGRESO a MXN pero el GASTO de
--     proveedores usaba `subtotal` crudo (una factura en USD se restaba 1:1),
--     y además incluía facturas de proveedor en borrador, que los KPIs de
--     Cuentas por Pagar excluyen a propósito.
-- A4: get_financial_kpis / get_mrr_detail sumaban `monthly_rate` sin mirar
--     `bookings.currency` / `bookings.tipo_cambio`.
--
-- Se parchean los cuerpos existentes conservando SECURITY DEFINER,
-- SET search_path = public y los guards de rol. Cada reemplazo se verifica:
-- si el ancla no existe, la migración falla en vez de aplicar algo parcial.

DO $mig$
DECLARE
  src text;
  before text;
BEGIN
  ---------------------------------------------------------------- A3
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_income_statement';
  IF src IS NULL THEN
    RAISE EXCEPTION 'A3: public.get_income_statement no existe';
  END IF;

  before := src;
  src := replace(src,
    $q$      sb.id, sb.subtotal, sb.total, sb.category::text AS category,$q$,
    $q$      -- FIX A3: el gasto de proveedores se sumaba en su moneda original.
      sb.id,
      (sb.subtotal * COALESCE(NULLIF(sb.exchange_rate, 0), 1))::numeric AS subtotal,
      (sb.total * COALESCE(NULLIF(sb.exchange_rate, 0), 1))::numeric AS total,
      COALESCE(NULLIF(sb.exchange_rate, 0), 1) AS fx,
      sb.category::text AS category,$q$);
  IF src = before THEN RAISE EXCEPTION 'A3: ancla sb_base no encontrada'; END IF;

  before := src;
  src := replace(src,
    $q$    WHERE sb.status <> 'cancelled'$q$,
    $q$    WHERE sb.status NOT IN ('cancelled', 'draft')$q$);
  IF src = before THEN RAISE EXCEPTION 'A3: ancla de status no encontrada'; END IF;

  before := src;
  src := replace(src,
    $q$        THEN sb.subtotal * (sp.amount / sb.total)
        ELSE sp.amount END AS amount,$q$,
    $q$        THEN sb.subtotal * ((sp.amount * sb.fx) / sb.total)
        ELSE sp.amount * sb.fx END AS amount,$q$);
  IF src = before THEN RAISE EXCEPTION 'A3: ancla sb_cash no encontrada'; END IF;

  EXECUTE src;

  ---------------------------------------------------------------- A4 (KPIs)
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_financial_kpis';
  IF src IS NULL THEN
    RAISE EXCEPTION 'A4: public.get_financial_kpis no existe';
  END IF;

  before := src;
  src := replace(src,
    $q$  SELECT COALESCE(SUM(COALESCE(b.monthly_rate, f.monthly_rate, 0)), 0)
    INTO v_mrr
$q$,
    $q$  -- FIX A4: la renta mensual se sumaba en crudo aunque la reserva
  -- estuviera pactada en dólares. Se convierte a MXN.
  SELECT COALESCE(SUM(
           COALESCE(b.monthly_rate, f.monthly_rate, 0)
           * CASE WHEN upper(COALESCE(b.currency, 'MXN')) = 'MXN'
                  THEN 1 ELSE COALESCE(NULLIF(b.tipo_cambio, 0), 1) END
         ), 0)
    INTO v_mrr
$q$);
  IF src = before THEN RAISE EXCEPTION 'A4: ancla v_mrr no encontrada'; END IF;

  before := src;
  src := replace(src,
    $q$  SELECT COALESCE(SUM(COALESCE(b.monthly_rate, f.monthly_rate, 0)), 0)
    INTO v_mrr_prev
$q$,
    $q$  SELECT COALESCE(SUM(
           COALESCE(b.monthly_rate, f.monthly_rate, 0)
           * CASE WHEN upper(COALESCE(b.currency, 'MXN')) = 'MXN'
                  THEN 1 ELSE COALESCE(NULLIF(b.tipo_cambio, 0), 1) END
         ), 0)
    INTO v_mrr_prev
$q$);
  IF src = before THEN RAISE EXCEPTION 'A4: ancla v_mrr_prev no encontrada'; END IF;

  EXECUTE src;

  ---------------------------------------------------------------- A4 (detalle)
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_mrr_detail';
  IF src IS NULL THEN
    RAISE EXCEPTION 'A4: public.get_mrr_detail no existe';
  END IF;

  before := src;
  src := replace(src,
    $q$      COALESCE(b.monthly_rate, f.monthly_rate, 0) AS monthly_rate,$q$,
    $q$      -- FIX A4: normalizado a MXN igual que get_financial_kpis.
      COALESCE(b.monthly_rate, f.monthly_rate, 0)
        * CASE WHEN upper(COALESCE(b.currency, 'MXN')) = 'MXN'
               THEN 1 ELSE COALESCE(NULLIF(b.tipo_cambio, 0), 1) END AS monthly_rate,$q$);
  IF src = before THEN RAISE EXCEPTION 'A4: ancla monthly_rate no encontrada'; END IF;

  EXECUTE src;
END
$mig$;