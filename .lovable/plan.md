
# Sprint v7.107.0 — Auditoría con datos reales + concurrencia

BL-49 ya se cerró en v7.106.1. El resto se aborda en orden de prioridad del reporte.

## Alcance

### P0 — BL-48 · `get_income_statement` ignora `operating_expenses`
Reemplazar la función vía migración:
- Agregar CTE `opex_by_month` agrupado por `expense_date` y `category` (excluyendo categorías ya excluidas del P&L por memoria `mem://features/operating-expenses`: software y depreciación — mantener consistencia con `mem://features/reporting`).
- Merge con `expenses_by_month` (UNION ALL) sin sobrescribir categorías existentes.
- Conservar shape actual (`revenue_*`, `expenses_by_category`, `gross_margin`, `net_income`, etc.) para no romper `IncomeStatementReport.tsx`.
- Test Vitest de regresión: seed con supplier_bill + operating_expense → net_income = revenue − (bills + opex).

### P1 — BL-50 · `get_mrr_detail` incoherente con KPI
Reescribir vía migración replicando la lógica de `get_financial_kpis`:
- `COALESCE(b.monthly_rate, f.monthly_rate)` como fuente de tarifa (pactada > maestra).
- Filtrar `b.recurring_billing = true`.
- Filtrar vigencia a hoy (`start_date <= today AND (end_date IS NULL OR end_date >= today)`) y excluir `status IN ('cancelled','completed')` como hace el KPI.
- Excluir filas sin `customer_id`.
- Exponer `rate_source` ('booking' | 'forklift') por fila para trazabilidad en la UI.
- Ajustar tipo de retorno si aplica y regenerar consumo en `/mrr` sólo si cambia el shape.

### P1 — DRIFT-01 · versionar objetos huérfanos
Migración de saneamiento idempotente (`CREATE IF NOT EXISTS`, `CREATE OR REPLACE`):
- `public.collection_reminders_log` (columnas existentes en prod: consultar vía `supabase--read_query` antes de escribir DDL).
- Funciones `create_notification`, `notify_admins`, `notify_payment_received` (leer definiciones actuales desde `pg_proc`).
- Policy sobre `realtime.messages`: documentar que vive fuera del repo por diseño de Supabase y omitir del saneamiento (no se puede versionar en el schema `realtime`).

### P2 — BL-52 · secuencias para folios RSV/COT/ENT/DEV
Migración:
1. `CREATE SEQUENCE booking_number_seq/quote_number_seq/delivery_number_seq/inspection_number_seq` con `START WITH (SELECT COALESCE(MAX(n), 0) + 1 FROM ...)` por cada prefijo.
2. `setval(...)` a partir del máximo actual excluyendo filas `is_e2e = true`.
3. Reescribir `next_booking_number`, `next_quote_number`, `next_delivery_number`, `next_inspection_number` siguiendo el patrón de `next_invoice_number` (usar `nextval` + formato `PREFIX-####`).
4. Mantener el sufijo `_e2e` intacto (usa su propio espacio).

### P2 — BL-51 · `get_customer_summary.total_paid`
Migración: cambiar `SUM(total) FILTER (WHERE status='paid')` por subquery contra `payments` unida a `invoices` filtrando `status <> 'cancelled'`. Test Vitest de regresión con factura parcial.

### P3 — OBS-1 · etiqueta P&L
Renombrar en UI `IncomeStatementReport.tsx` la etiqueta actual "Ventas" (o equivalente) a **"Otros ingresos / sin reserva"**. Sin cambios de datos.

### P3 — OBS-2 · hardening índice único de folios
Documentar en `mem://logic/document-numbering` que los folios `is_e2e = true` viven en espacio propio y que `allow_e2e_seed` es la única barrera para prod. No requiere código.

## Fuera de alcance
- Migrar RLS del schema `realtime` (no versionable).
- Cambios visuales en el módulo de MRR más allá de mostrar `rate_source` si conviene.

## Detalles técnicos

- Todas las funciones se recrean con `SECURITY DEFINER` + `SET search_path = public`, conservando el guard actual (`admin/administrativo/auditor/ventas` donde corresponda) — leer definiciones vigentes antes de escribir para no perder guards.
- Cada migración: una sola invocación `supabase--migration` con SQL completo (sin combinar con edits en la misma respuesta).
- Cerrar sprint agregando `public/changelog/v7.107.0.json` + entrada en `public/changelog.json` describiendo cada hallazgo con su etiqueta BL/DRIFT/OBS.
- Verificación: correr `supabase--read_query` post-migración para validar (income statement con opex, mrr_detail vs financial_kpis, folio secuencial). Vitest opcional para BL-48 y BL-51.

## Orden de ejecución

1. Lectura previa: `supabase--read_query` para definiciones actuales de `get_income_statement`, `get_mrr_detail`, `get_customer_summary`, y de las 4 funciones `next_*_number`; y para el schema de `collection_reminders_log` y las funciones `notify_*` en prod.
2. Migración BL-48.
3. Migración BL-50.
4. Migración BL-52 (secuencias).
5. Migración BL-51.
6. Migración DRIFT-01 (saneamiento).
7. Cambio UI OBS-1.
8. Tests + changelog v7.107.0.
