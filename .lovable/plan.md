## Bug
`/flujo-de-caja` falla con `column invoices.credited_amount does not exist` (42703). En `src/features/cash-flow/lib/queryKeys.ts` la proyección lee `credited_amount` desde `invoices`, pero esa columna sólo existe en la vista `v_invoices_with_balance` (donde se calcula restando las NCs timbradas). Cambio introducido en v7.209.0 para descontar NCs del pronóstico, pero se apuntó a la tabla equivocada.

## Fix
En `cashFlowProjectionQueries.list` de `src/features/cash-flow/lib/queryKeys.ts`:

- Reemplazar `supabase.from("invoices")` por `supabase.from("v_invoices_with_balance")` en el select de facturas activas (mantiene las mismas columnas, incluido `credited_amount`, `moneda`, `tipo_cambio`, `total`, `due_date`, `customer_name`, `invoice_number`, `status`).
- Mantener los filtros por `status in (sent, partial, overdue)` y `due_date not null`.
- Conservar `.returns<InvoiceRow[]>()` (el shape de `InvoiceRow` ya incluye `credited_amount` opcional).

No se modifica la lógica de transformación ni los tests, sólo la fuente de datos.

## Changelog
Nuevo `public/changelog/v7.215.1.json` (patch, category `bugfix`) + entrada al inicio de `public/changelog.json` describiendo que `/flujo-de-caja` volvió a cargar leyendo desde la vista con balance.

## Verificación
- `psql` contra `v_invoices_with_balance` filtrando por los mismos status para confirmar que devuelve filas y `credited_amount`.
- Recarga de `/flujo-de-caja` en preview vía Playwright si es necesario.
