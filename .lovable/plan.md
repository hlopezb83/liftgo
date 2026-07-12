# Auditoría — Carta "Flujo de Efectivo" del Dashboard

Fuente de datos: bloque `'cash_flow'` dentro del RPC de estadísticas del dashboard (última migración `20260615003939_*.sql`). Componente cliente: `src/features/dashboard/components/dashboard/CashFlowChart.tsx` (barras Facturado vs Pagado, 6 meses).

## Bugs encontrados

Sí, hay varios problemas. Verificados contra la base:

1. **Ventana temporal parcial (mes recortado).** El filtro es `issued_at >= CURRENT_DATE - INTERVAL '6 months'`. Hoy (12 jul) eso arranca el **12 de enero**, así que la barra de enero omite las facturas del 1 al 11 de enero. La consulta confirma: enero 2026 muestra sólo 2 facturas / $45,240 (mes truncado).
2. **Meses sin datos = huecos.** No hay `generate_series`. Si un mes no tuvo facturas, simplemente no aparece la barra (parece que "faltan datos"). El resto de charts del dashboard sí generan la serie completa.
3. **Facturas canceladas incluidas.** No se filtra por `status <> 'cancelled'` ni `cancelled_at IS NULL`. Julio ya trae 9 canceladas dentro de los $737,064 "facturados".
4. **`Pagado` atribuido al mes de emisión, no al mes del cobro.** La consulta hace `SUM(CASE WHEN paid_at IS NOT NULL THEN total)` agrupado por `issued_at`. Para un *flujo de efectivo* la barra "Pagado" debería representar el dinero que entró ese mes (agrupar por `paid_at`), no facturas emitidas ese mes que en algún momento se pagaron.
5. **Pagos parciales ignorados.** Se usa `total` como monto pagado; una factura sólo cuenta si `paid_at IS NOT NULL` (todo-o-nada). Con la tabla `payments` que ya soporta pagos parciales (memoria "Payment Tracking"), el monto real cobrado debería salir de `SUM(payments.amount)`.
6. **Notas de crédito no restan.** `credit_notes` no se resta del facturado neto.

## Alcance del cambio

Sólo el bloque `'cash_flow'` del RPC del dashboard + una prueba unitaria de `mapCashFlow`. No se toca la UI (el contrato `{ month, month_key, invoiced, paid }` se conserva). No se toca la página `/cash-flow` (módulo aparte, proyecciones).

## Cambios

### 1. Nueva migración: reescribir el sub-select `cash_flow`

Reemplazar el bloque por una versión con:

- CTE `months` con `generate_series(5, 0, -1)` produciendo 6 meses completos alineados a `DATE_TRUNC('month', CURRENT_DATE)`.
- CTE `invoiced_by_month`: `SUM(total)` de `invoices` **excluyendo canceladas** (`status <> 'cancelled' AND cancelled_at IS NULL`), agrupado por `DATE_TRUNC('month', issued_at)`.
- CTE `credited_by_month`: `SUM(total)` de `credit_notes` no canceladas por mes emisión, para restar del facturado neto.
- CTE `paid_by_month`: `SUM(amount)` de `payments` agrupado por `DATE_TRUNC('month', paid_at)` (mes real del cobro), con el mismo filtro anti-cancelación por join a `invoices`.
- `LEFT JOIN` de las tres CTEs contra `months`; `COALESCE` a 0.

```sql
'cash_flow', (
  WITH months AS (
    SELECT (DATE_TRUNC('month', CURRENT_DATE)::date - make_interval(months => m))::date AS m
    FROM generate_series(5, 0, -1) AS m
  ),
  invoiced_cte AS (
    SELECT DATE_TRUNC('month', issued_at)::date AS m, SUM(total) AS amt
    FROM invoices
    WHERE issued_at >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months')
      AND status <> 'cancelled' AND cancelled_at IS NULL
    GROUP BY 1
  ),
  credited_cte AS (
    SELECT DATE_TRUNC('month', issued_at)::date AS m, SUM(total) AS amt
    FROM credit_notes
    WHERE issued_at >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months')
      AND COALESCE(status,'') <> 'cancelled'
    GROUP BY 1
  ),
  paid_cte AS (
    SELECT DATE_TRUNC('month', p.paid_at)::date AS m, SUM(p.amount) AS amt
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE p.paid_at >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months')
      AND i.status <> 'cancelled' AND i.cancelled_at IS NULL
    GROUP BY 1
  )
  SELECT COALESCE(json_agg(json_build_object(
    'month',     TO_CHAR(months.m, 'Mon YYYY'),
    'month_key', TO_CHAR(months.m, 'YYYY-MM'),
    'invoiced',  COALESCE(i.amt, 0) - COALESCE(c.amt, 0),
    'paid',      COALESCE(p.amt, 0)
  ) ORDER BY months.m), '[]'::json)
  FROM months
  LEFT JOIN invoiced_cte i ON i.m = months.m
  LEFT JOIN credited_cte c ON c.m = months.m
  LEFT JOIN paid_cte     p ON p.m = months.m
)
```

Antes de escribir la migración, verificaré con `supabase--read_query` los nombres exactos de columnas en `payments` (`invoice_id`, `paid_at`, `amount`) y `credit_notes` para no romper la firma.

### 2. Test unitario adicional

En `src/features/dashboard/lib/__tests__/dashboardSectionHelpers.test.ts`: caso con `paid > invoiced` en el mismo mes (cobros de facturas antiguas) para verificar que la UI no rompe con esa relación.

### 3. Changelog

Nueva entrada `v7.61.1` (patch): bugfix en flujo de efectivo del dashboard (ventana temporal completa, cancelaciones excluidas, notas de crédito restadas, pagos parciales, "Pagado" ahora por mes de cobro).

## Fuera de alcance

- No se cambia el color/leyenda ni el tooltip.
- No se toca la página `/cash-flow` ni sus proyecciones.
- No se agregan filtros por moneda (MXN/USD) — se puede evaluar en otro sprint.

## Riesgos

- Los números de la barra **cambiarán visiblemente** para meses con cobros de facturas antiguas: es lo correcto. Se documenta en el changelog para que el usuario no lo perciba como regresión.
- Si `payments` no tiene un pago migrado para facturas viejas marcadas con `paid_at`, esas facturas podrían dejar de contribuir a "Pagado". Verificaré con una consulta rápida (`SELECT COUNT(*) FROM invoices WHERE paid_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM payments WHERE invoice_id = invoices.id)`) antes de aplicar el cambio, y si hay casos huérfanos añadiré un fallback en la CTE `paid_cte` con `UNION ALL` sobre `invoices.paid_at` para esos ids.
