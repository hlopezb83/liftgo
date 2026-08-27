# Flujo de efectivo del Panel: la barra "Pagado" solo aparece en agosto

## Qué está pasando (confirmado con datos reales)

La gráfica suma los pagos usando la columna `payments.amount_mxn` (el monto ya convertido a pesos). Esa columna se llena automáticamente **solo cuando se crea o edita un pago**, y se agregó apenas hace poco. Los pagos anteriores nunca se rellenaron.

Estado real de la base hoy:

```text
mes        pagos   con amount_mxn   suma amount   suma amount_mxn
2026-08      14           1           506,164.09      41,097.64
2026-07       7           0           332,108.00           (0)
2026-06      12           0           307,168.00           (0)
2026-05      14           0           683,500.27           (0)
2026-04      10           0           293,480.00           (0)
2026-03       7           0           199,520.00           (0)
```

Todos esos pagos están en MXN (no hay pagos en divisa), así que el monto correcto es simplemente `amount`. Es decir: la gráfica no está "filtrando mal por fecha", está sumando una columna vacía. Y agosto tampoco está bien: muestra 41 mil de 506 mil reales.

## Corrección propuesta

Dos partes, para arreglar el pasado y blindar el futuro:

1. **Relleno único (backfill)**: llenar `payments.amount_mxn` en los pagos históricos donde está vacío, usando el tipo de cambio del pago, y si no hay, el de la factura, y 1 cuando el pago es en pesos. Ningún pago actual está en divisa, así que el resultado equivale a su monto en pesos.
2. **Red de seguridad en el Panel**: en el bloque `paid_cte` de `get_dashboard_stats`, en vez de `SUM(p.amount_mxn)` usar el valor convertido al vuelo cuando `amount_mxn` sea nulo (misma regla de precedencia: tipo de cambio del pago → tipo de cambio de la factura → 1 solo si el pago es MXN). Así, si un pago se cuela sin la columna llena, la gráfica no lo pierde.

No se toca la lógica de "Facturado" ni las notas de crédito: esas ya convierten correctamente.

## Detalles técnicos

- Migración SQL:
  - `UPDATE public.payments SET amount_mxn = ROUND(amount * COALESCE(NULLIF(exchange_rate,0), NULLIF(i.tipo_cambio,0), 1), 2) FROM invoices i WHERE i.id = payments.invoice_id AND amount_mxn IS NULL` (con la variante para pagos sin factura asociada y solo tocando filas nulas).
  - `CREATE OR REPLACE FUNCTION public.get_dashboard_stats(...)` recreada igual que hoy, cambiando únicamente `paid_cte` para usar `COALESCE(p.amount_mxn, p.amount * COALESCE(NULLIF(p.exchange_rate,0), NULLIF(pi.tipo_cambio,0), CASE WHEN upper(COALESCE(p.currency,'MXN'))='MXN' THEN 1 END), 0)`.
  - Se conserva `SECURITY DEFINER`, `SET search_path = public` y los `REVOKE`/`GRANT` actuales (sin `EXECUTE` para `anon`).
- Verificación: comparar mes a mes `SUM(amount)` vs `SUM(amount_mxn)` después del backfill, y volver a leer la tarjeta del Panel.
- Changelog: nueva entrada patch/minor en `public/changelog/`.
