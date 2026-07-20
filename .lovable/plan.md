## Bug

Al abrir `/customers/:id`, la RPC `get_customer_profitability` falla con:

```
column ml.total_cost does not exist (42703)
```

La RPC (definida en `supabase/migrations/20260713173740_...sql`) hace:

```sql
SELECT COALESCE(SUM(ml.total_cost), 0)
FROM public.maintenance_logs ml
JOIN public.bookings b ON b.forklift_id = ml.forklift_id
WHERE b.customer_id = p_customer_id
```

Pero `maintenance_logs` tiene columna `cost`, no `total_cost`. `total_cost` sólo existe en la tabla nueva `maintenance_labor` (v7.97.0). El trigger `recalc_maintenance_log_cost` ya deja en `maintenance_logs.cost` la suma refacciones + mano de obra, así que ese es el campo correcto.

## Fix

Migración que reemplaza `get_customer_profitability` cambiando `SUM(ml.total_cost)` → `SUM(ml.cost)`, manteniendo:
- El guard de autorización (`admin`/`administrativo`/`ventas`).
- `SET search_path = public`, `SECURITY DEFINER`, mismo shape de respuesta (`revenue`, `maintenance_cost`, `gross_margin`, `margin_percent`).
- El scope: costos de mantenimiento de forklifts que tienen bookings del cliente (semántica igual a la actual, sólo se corrige el nombre de columna).

## Verificación

- Ejecutar la RPC contra el customer del reporte (`7b0c307a-...`) y confirmar que regresa JSON.
- Recargar `/customers/:id` en móvil y verificar que la tarjeta de rentabilidad renderiza sin toast de error.

## Changelog

Nueva entrada `v7.106.1` (patch) en `public/changelog.json` + `public/changelog/v7.106.1.json` describiendo el fix bajo la etiqueta BL-48.
