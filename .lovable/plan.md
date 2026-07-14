## Diagnóstico

En el Estado de Resultados de julio 2026, Logistorage aparece con **$55,500 en "Ingresos por Ventas"** en lugar de "Ingresos por Rentas". La causa es una factura mal clasificada.

### Datos encontrados

**Factura FAC-0089** (Logistorage · 07/07/2026 · timbrada):
- Subtotal $55,500 (3 líneas de renta mensual del 01–31 jul).
- `booking_id = NULL`, `quote_id = NULL`, **0 filas en `invoice_bookings`**.
- Tiene `billing_period_start = 2026-07-01` y `billing_period_end = 2026-07-31`.
- Las líneas describen "Renta mensual" con series de montacargas de reservas activas de Logistorage.

**Comparativo — FAC-0072** (mismo cliente, junio, mismo importe): sí tiene 3 filas en `invoice_bookings` → se clasificó bien como renta.

### Causa raíz

La función RPC `get_income_statement` clasifica como renta sólo si:
```
booking_id IS NOT NULL
OR EXISTS(invoice_bookings)
OR quote_id → rental_quote
```

FAC-0089 no cumple ninguna: fue creada manualmente (no por el generador recurrente, que siempre inserta `invoice_bookings`). Por eso cae al bucket "Ventas".

Logistorage tiene 3 `bookings` recurrentes confirmadas (668f181f, 573d31d4, aa79bb87). Las series en las líneas de FAC-0089 (068515575, 068515571, 068515572) apuntan a los montacargas de esas reservas.

## Plan de corrección (2 partes)

### Parte 1 — Parche de datos (migración)

Vincular FAC-0089 a sus 3 bookings vía `invoice_bookings` para reclasificar históricamente el mes de julio.

```sql
-- Migración: link_fac_0089_to_logistorage_bookings
INSERT INTO invoice_bookings (invoice_id, booking_id, line_index)
SELECT
  '3b77938f-61ca-4b4b-a51a-f6553b05478e',
  b.id,
  row_number() OVER (ORDER BY f.serial_number) - 1
FROM bookings b
JOIN forklifts f ON f.id = b.forklift_id
WHERE b.customer_id = '71b1065c-301a-4d2c-8ba8-0d1f962c3bb9'
  AND f.serial_number IN ('068515575', '068515571', '068515572')
ON CONFLICT DO NOTHING;
```

Antes de aplicar, verifico el `line_index` correcto contra el orden de `line_items` de FAC-0089 (mapear serie → índice exacto).

### Parte 2 — Robustecer la clasificación (RPC)

Actualizar `get_income_statement` para que, cuando `booking_id`, `invoice_bookings` y `quote_id` estén vacíos, use `billing_period_start IS NOT NULL AND billing_period_end IS NOT NULL` como señal adicional de renta (todas las facturas de renta recurrente rellenan este campo; las ventas de equipo no).

Nueva definición de `is_rental` en el CTE `inv_classified`:
```sql
i.booking_id IS NOT NULL
OR EXISTS (SELECT 1 FROM invoice_bookings ib WHERE ib.invoice_id = i.id)
OR (i.quote_id IS NOT NULL AND i.quote_id IN (SELECT id FROM rental_quotes))
OR (i.billing_period_start IS NOT NULL AND i.billing_period_end IS NOT NULL)
```

Con esto, cualquier factura manual creada con periodo de facturación (patrón exclusivo de rentas) se clasifica correctamente aunque le falte el link.

### Parte 3 — Changelog

Nueva entrada en `public/changelog.json` + `public/changelog/v7.71.1.json` describiendo:
- Reclasificación de FAC-0089 (Logistorage jul 2026) a ingresos por renta.
- Hardening de `get_income_statement` para reconocer rentas por periodo de facturación.

## Verificación

1. `SELECT revenue_rental, revenue_sales FROM get_income_statement('2026-07-01','2026-07-31','accrual')` — Logistorage debe aparecer en `rental_by_customer` con $55,500 y desaparecer de `sales_by_customer`.
2. Recargar `/income-statement` y confirmar que el mes de julio ya no muestra $55,500 en "Ingresos por Ventas".

## Notas fuera de alcance

- Investigar el flujo UX que permitió crear FAC-0089 manualmente sin vincular bookings (probablemente "Nueva factura" desde el módulo). Se puede abordar en un sprint posterior si el usuario lo desea.
