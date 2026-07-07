# Bug: "Generar recurrentes" produjo facturas con periodos históricos

## Diagnóstico

Hoy (07/07/2026) el job `generate-recurring-invoices` timbró **7 facturas con periodo equivocado** — todas debían ser de julio 2026:

| Folio | Periodo generado | Debería ser |
|---|---|---|
| FAC-0079 | 03/2026 | 07/2026 |
| FAC-0080 | 04/2026 | 07/2026 |
| FAC-0081 | 12/2025 | 07/2026 |
| FAC-0082 | 12/2025 | 07/2026 |
| FAC-0083 | 12/2025 | 07/2026 |
| FAC-0084 | 01/2026 | 07/2026 |
| FAC-0085 | 04/2026 | 07/2026 |

### Causa raíz

`bookings.last_billed_date` de **todas** las reservas recurrentes está desincronizado con el historial real:

```
RSV-0003..0017:  last_billed_date = fecha vieja   |  MAX(billing_period_end real) = 2026-06-30
RSV-0018..0020:  last_billed_date = 2026-07-31    |  MAX(billing_period_end real) = 2026-06-30
```

El "auto-heal" agregado en v6.107.3 (líneas 122-138 de `supabase/functions/generate-recurring-invoices/index.ts`) hace esta consulta:

```
¿Existe una factura vinculada a esta reserva
 con billing_period_end = last_billed_date
 y no cancelada?
```

Las facturas antiguas (FAC-0004…FAC-0042) fueron creadas **antes de que existiera la columna `billing_period_end`** (agregada en v5.62.0), por lo que tienen `billing_period_end = NULL`. La consulta no encuentra coincidencia y el auto-heal **resetea `effectiveLastBilled` a `null`**, tratando la reserva como **nunca facturada**. Entonces:

- `billingStart = firstOfMonth(booking.start_date)` → 01/12/2025, 01/01/2026, etc.
- El check de "already invoiced" (líneas 182-193) filtra por `billing_period_start` + `billing_period_end` exactos, así que tampoco detecta las facturas legacy con periodos NULL.
- Se inserta la factura del primer mes de la reserva → luego se timbra.

Es un fallo silencioso: cualquier reserva con al menos una factura legacy (period NULL) es vulnerable.

## Cambios

### 1. `supabase/functions/generate-recurring-invoices/index.ts` — auto-heal robusto

Reemplazar el bloque de auto-heal (líneas 122-138) por una consulta que derive `effectiveLastBilled` desde el historial real:

```
SELECT MAX(i.billing_period_end) AS last_period_end,
       MAX(i.issued_at) FILTER (WHERE billing_period_end IS NULL) AS legacy_marker
  FROM invoice_bookings ib
  JOIN invoices i ON i.id = ib.invoice_id
 WHERE ib.booking_id = :bookingId
   AND i.status <> 'cancelled'
   AND i.cfdi_status <> 'cancelled';
```

Reglas:

- Si `last_period_end` existe → usarlo como `effectiveLastBilled` (source of truth, ignora `bookings.last_billed_date`).
- Si NO existe `last_period_end` pero SÍ hay facturas legacy → conservar `bookings.last_billed_date` (no resetear a null).
- Si no hay ninguna factura vinculada → `effectiveLastBilled = null` (comportamiento actual para reservas realmente nuevas).

### 2. Guarda de seguridad contra periodos históricos

Después de calcular `billingStart`, si `billingEnd` es anterior a `firstOfMonth(nowMty) - 1 mes` (es decir, la reserva quedó "atrás" más de un mes completo), marcar la línea como no elegible con nueva razón `"period_too_old"` y **no generar**. Aparecerá en el preview con motivo explícito para que Admin la resuelva manualmente en vez de facturar en silencio un periodo viejo.

Añadir el tipo `"period_too_old"` en `PreviewReason` (backend y en `usePreviewRecurringInvoices.ts`) y un label en `RecurringInvoicesResultDialog`/preview UI.

### 3. Sincronización de datos existente (migración)

Migración SQL que recalcula `last_billed_date` para todas las reservas recurrentes desde el historial real:

```
UPDATE bookings b
   SET last_billed_date = sub.max_end
  FROM (
    SELECT ib.booking_id, MAX(i.billing_period_end) AS max_end
      FROM invoice_bookings ib
      JOIN invoices i ON i.id = ib.invoice_id
     WHERE i.status <> 'cancelled' AND i.cfdi_status <> 'cancelled'
       AND i.billing_period_end IS NOT NULL
     GROUP BY ib.booking_id
  ) sub
 WHERE b.id = sub.booking_id
   AND (b.last_billed_date IS DISTINCT FROM sub.max_end);
```

Esto deja las 14 reservas listas para facturar el periodo correcto (Julio 2026) en el próximo run.

### 4. Test

Extender `supabase/functions/generate-recurring-invoices/index_test.ts` (o `_shared/test`) con un caso unitario del auto-heal:

- Reserva con `last_billed_date = 2025-12-31` y facturas legacy (period NULL) → **no** debe resetear.
- Reserva con `last_billed_date = 2026-06-30` y factura con `billing_period_end = 2026-06-30` → mantiene.
- Reserva sin facturas → `null`.

### 5. Acción operativa (fuera de código)

Las 7 facturas ya timbradas (FAC-0079..0085) deben cancelarse ante el SAT usando el flujo existente de `cancel-cfdi` y re-emitirse con el periodo correcto. Esto lo hace el usuario desde la UI; no es automatizable ni forma parte de este fix.

### 6. Changelog

Nueva entrada `v6.110.0` (minor + fix) documentando causa raíz, corrección y guarda de seguridad.

## Detalles técnicos

- Archivos tocados: `supabase/functions/generate-recurring-invoices/index.ts`, `src/features/invoices/hooks/invoices/recurring/usePreviewRecurringInvoices.ts`, componente(s) de preview para el nuevo motivo, nuevo migration file, `public/changelog/v6.110.0.json` + `public/changelog.json`.
- El check de "already invoiced" se conserva tal cual — con `last_billed_date` correcto y auto-heal robusto ya no hay ambigüedad.
- La guarda `period_too_old` protege contra futuros escenarios (data corrupta, resets manuales, migraciones incompletas) sin bloquear el flujo normal.
- Fuera de alcance: backfill de `billing_period_start/end` en facturas legacy (FAC-0004..0042). No es necesario: con `last_billed_date` correcto, el generador avanza desde ahí.
