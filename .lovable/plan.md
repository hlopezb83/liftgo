
## Problema

La cartera vencida del dashboard está inflada porque suma el **total bruto** de cada factura en lugar del **saldo pendiente** (total − pagos). Las facturas en estado `partial` (con pagos parciales) cuentan completas, no por su saldo restante.

Esto ocurre en 3 lugares:

1. **`get_financial_kpis()` (RPC)** — `overdue_total` y `overdue_total_prev` suman `i.total` directamente.
2. **`get_dashboard_stats()` (RPC)** — `overdue_invoices[].total` devuelve el total bruto, y `invoice_stats.outstanding_revenue` también suma `total` de no pagadas; además **excluye `partial`** del listado de vencidas.
3. **Frontend** — `useDashboardSections.computeAgingBuckets` y `AgingReport.tsx` calculan buckets usando `Number(inv.total)` en vez del saldo recibido.

## Cambios

### 1. Migración SQL — corregir RPCs

Reemplazar las dos funciones para que calculen `balance = total − COALESCE(SUM(payments.amount), 0)`:

- `get_financial_kpis()`:
  - `v_overdue_total`: sumar `(i.total − pagos)` para facturas con `status IN ('sent','partial','overdue')` y `due_date < hoy`.
  - `v_overdue_total_prev`: mismo cálculo, pero pagos filtrados a `payment_date <= v_last_prev_month`.
- `get_dashboard_stats()`:
  - `overdue_invoices`: incluir `status = 'partial'`, agregar campo `balance` (total − pagos) y conservar `total` para retrocompatibilidad.
  - `invoice_stats.outstanding_revenue`: sumar saldos en lugar de totales.

### 2. Frontend

- **`useDashboardSections.ts`**: `computeAgingBuckets` debe usar `inv.balance ?? inv.total` (preferir saldo). Tipar `overdueInvoices` para incluir `balance?: number`.
- **`AgingReport.tsx`**: usar `balance` cuando esté disponible para la columna "Monto", totales por bucket y exportación CSV. Si el campo no viene (compatibilidad), calcular con `useInvoices` (que ya trae pagos) en vez de `total`.

### 3. Changelog

Agregar entrada `6.44.8` (patch, bug-fix): "Cartera vencida ahora descuenta pagos parciales".

## Validación

- Query manual: comparar `SUM(total)` vs `SUM(total − pagos)` para facturas vencidas, confirmar que el dashboard refleja el segundo.
- Tests existentes de invoiceHelpers/paymentFlow siguen verdes.

## Notas técnicas

```sql
-- Fragmento clave para overdue_total
SELECT COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0)
INTO v_overdue_total
FROM invoices i
LEFT JOIN (
  SELECT invoice_id, SUM(amount) AS paid FROM payments GROUP BY invoice_id
) p ON p.invoice_id = i.id
WHERE i.status IN ('sent','partial','overdue') AND i.due_date < v_today;
```
