## Objetivo
Hacer el detalle del historial (tarjeta lateral + diálogo de detalle) realmente legible: cada cambio debe mostrar **etiqueta del campo en español + valor anterior con formato + valor nuevo con formato**, en lugar del `JSON.stringify` crudo actual.

## Estado actual
- `AuditLogDetailDialog` muestra `JSON.stringify(value)` → genera ruido como `"available"`, `123.45`, `"2026-04-28T21:02:00Z"`, `null`.
- `ProspectHistoryCard` ya formatea bien `stage`, `lost_reason`, `deal_value`, `final_amount`, pero el resto cae a `String(value)` y los timestamps salen como ISO.
- La lógica está duplicada (tarjeta vs. diálogo) y no aprovecha ningún formateador central.

## Cambios

### 1. `src/components/auditTrail/auditTrailConstants.tsx`
Agregar un formateador central:

```ts
export function formatAuditValue(field: string, value: unknown): string
```

Reglas:
- `null | undefined | ""` → `"—"`
- Campos monetarios (set: `deal_value, final_amount, total, subtotal, tax_amount, daily_rate, weekly_rate, monthly_rate, cost, estimated_cost, actual_cost, damage_cost, deposit_amount, amount`) → `formatCurrency(Number(value))`.
- Campos de fecha (`*_at`, `*_date`, `valid_until`) → `dd/MM/yyyy HH:mm` (timestamps con hora) o `dd/MM/yyyy` cuando sólo hay fecha.
- `stage` / `lost_reason` → usar `STAGE_LABELS` / `LOST_REASON_LABELS` (mover los STAGE_LABELS de `ProspectHistoryCard` a `lib/constants/crm.ts` para reusar).
- `status` → diccionario por nombre genérico (Activo / Borrador / Enviado / Pagado / Cancelado / Disponible / etc.) — basado en los labels ya existentes en `lib/constants/domain.ts`.
- `boolean` → `Sí` / `No`.
- `object` (JSON anidado: `line_items`, `terms_text` largo, etc.) → `"(estructura actualizada)"` y dejar que el botón "Ver detalle" muestre el JSON crudo si hace falta.
- `string` con longitud > 80 → truncar con `…` (el detalle queda en el diálogo).
- Resto → `String(value)`.

Exportar también `HIDDEN_DIFF_FIELDS` (`updated_at`, `stage_order`) para reusar.

### 2. `src/components/auditTrail/AuditLogDetailDialog.tsx`
- Reemplazar `JSON.stringify(log.old_data?.[field])` y `JSON.stringify(log.new_data?.[field])` por `formatAuditValue(field, …)`.
- Filtrar `HIDDEN_DIFF_FIELDS` de la tabla.
- Estilizar la columna anterior con `text-destructive line-through` y la nueva con `text-emerald-600 font-medium` para reforzar visualmente el diff.
- INSERT y DELETE: en vez de `<pre>` con JSON crudo, renderizar una **tabla de dos columnas** (Campo + Valor) usando `formatAuditValue`, ordenada y filtrando `HIDDEN_DIFF_FIELDS`. Mantener el `<pre>` colapsado en un `<details>` por si el auditor necesita ver el JSON original.

### 3. `src/components/crm/ProspectHistoryCard.tsx`
- Borrar `fmtValue`, `STAGE_LABELS`, `CURRENCY_FIELDS`, `HIDDEN_FIELDS` locales.
- Usar `formatAuditValue` y `HIDDEN_DIFF_FIELDS` importados.
- Mantener el formato de línea: `Etiqueta: anterior → nuevo`.

### 4. Changelog v5.65.5
- `public/changelog.json` (entrada `improvement`, patch).
- `public/changelog/v5.65.5.json` describiendo el formato legible del diff (afecta a todos los módulos auditados, no sólo CRM).

## Fuera de alcance
- No se cambian triggers ni la estructura de `audit_logs`.
- No se agregan nuevas traducciones de tablas, sólo de valores.
- No se altera la tarjeta de actividad de alto nivel ni `Activity Monitoring`.