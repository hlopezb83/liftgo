## Diagnóstico

`FAC-0072` (LOGISTORAGE, $55,500) tiene 3 reservas de renta vinculadas en la tabla `invoice_bookings` (RSV-0018, 19, 20), pero el RPC `get_income_statement` clasifica el ingreso como renta o venta usando únicamente:

```sql
is_rental = (i.booking_id IS NOT NULL OR (i.quote_id IS NOT NULL AND i.quote_id IN rental_quotes))
```

En facturas multi-reserva (las que usan la relación many-to-many `invoice_bookings`), `invoices.booking_id` queda en NULL, así que el ingreso cae por defecto a "Ventas". Cualquier factura recurrente con varios montacargas tiene el mismo problema.

## Fix

Actualizar el RPC `get_income_statement` para reconocer también `invoice_bookings`:

```sql
is_rental = (
  i.booking_id IS NOT NULL
  OR EXISTS (SELECT 1 FROM invoice_bookings ib WHERE ib.invoice_id = i.id)
  OR (i.quote_id IS NOT NULL AND i.quote_id IN (SELECT id FROM rental_quotes))
)
```

Esto se aplica en el CTE principal del RPC, así que `revenue_rental`, `revenue_sales`, `rental_by_customer` y `sales_by_customer` quedan corregidos en un solo lugar.

## Cambios

1. **Migración SQL** — `CREATE OR REPLACE FUNCTION public.get_income_statement(...)` con la condición ampliada. Cuerpo de la función idéntico al actual salvo esa línea. Mantiene firma, `SECURITY DEFINER` y `SET search_path = public`.
2. **Changelog v6.90.2** (patch — bug fix) en `public/changelog.json` + `public/changelog/v6.90.2.json`.

## Notas

- No cambia el frontend ni el esquema de tablas.
- No impacta facturas de venta legítimas (no tienen filas en `invoice_bookings`).
- Tras aplicar, FAC-0072 y futuras facturas multi-reserva se reportarán automáticamente en "Ingresos por Rentas".
