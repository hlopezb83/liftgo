# Fix: `column reference "fx_missing" is ambiguous` en ficha de cliente (v7.414.2)

## Causa raíz (confirmada contra la base de datos)

En la función RPC `public.get_customer_summary`, la CTE `scoped` hace `SELECT v.*` sobre la vista `v_invoices_with_balance` **y además** agrega una columna calculada con el mismo nombre:

```sql
SELECT v.*, public.fx_is_missing(v.moneda, v.tipo_cambio) AS fx_missing, ...
```

La vista ya incluye su propia columna `fx_missing`, así que `WHERE NOT fx_missing` (CTE `usable`) y `s.fx_missing` quedan ambiguos → Postgres error `42702` y la pantalla `/customers/:id` muestra "No se pudo cargar la información".

Analogía: dos personas con el mismo nombre en una junta; cuando alguien dice "fx_missing", nadie sabe a cuál llamar.

Es la única función con este problema (revisadas también `get_income_statement`, `report_revenue_by_month`, `get_financial_kpis`, `get_mrr_detail`, `set_supplier_bill_approval_status`: todas califican la columna o usan alias no conflictivos).

## Cambio (1 migración, solo SQL)

- Re-definir `public.get_customer_summary` con `CREATE OR REPLACE` eliminando la línea redundante del alias calculado; la CTE `scoped` pasa a usar directamente la columna `fx_missing` que ya trae la vista `v_invoices_with_balance` (misma regla canónica `fx_is_missing`).
- No se toca ninguna regla de negocio, RLS ni la vista. El resultado JSON de la función queda idéntico.

## Verificación

- Ejecutar `SELECT public.get_customer_summary('<id del cliente del reporte>')` vía read_query y confirmar que devuelve JSON sin error.
- Confirmar que los totales y `fx_missing_count` se calculan igual que antes (misma fórmula, misma columna de la vista).

## Changelog y versión

- Nueva entrada en `CHANGELOG.md` (patch): corrección del error de columna ambigua en el resumen de cliente.
- `gen-version.mjs` → **7.414.2**.
