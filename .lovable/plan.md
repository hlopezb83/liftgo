## Auditoría Ola 3.3

**Estado verde:** 1097/1097 Vitest, typecheck limpio, RPC `report_profit_by_model` aplicado y activo.

**Hallazgos menores a corregir antes de avanzar:**

1. **Violación de core rule (lucide-react directo)** en `ProfitabilityByModelReport.tsx`:
   ```ts
   import { AlertTriangle } from "lucide-react";
   ```
   La memoria core prohíbe importar `lucide-react` directamente — debe usar el Icon registry (`@/components/icons`).
2. **`as ModelRow[]`** en el mismo archivo — viola la core rule "sin `!`/`as`". `ProfitByModelRow` y `ModelRow` son estructuralmente idénticos: hay que unificar el tipo, no castear.
3. **Código muerto tras EC-A4**: `profitabilityHelpers.ts` (funciones `buildRevenueMap`, `aggregateRows`, `buildCostMap`, `buildModelUnitsMap`, `inRange`) y su test `__tests__/profitabilityHelpers.test.ts` ya no tienen consumidores — sólo se importaba `ModelRow` (que moveremos al hook).
4. **Falta test del hook** `useProfitByModelReport` — sin cobertura del mapping numérico (`Number(...)` sobre strings de Postgres) ni del error path.
5. **`chartRows = rows` redundante** en el reporte (variable espejo sin transformación).

**Follow-up mayor pendiente del audit maestro:** UX-M1 QuoteForm a RHF+Zod (diferido explícitamente desde Ola 3.2 por tamaño — line-items, descuentos, multi-moneda, `rental_meta`).

---

## Plan Ola 3.4 — Pulido EC-A4 + fundamento QuoteForm (schema-first)

### A) Pulido EC-A4 (cierre limpio de Ola 3.3)

1. `useProfitByModelReport.ts`: promover `ProfitByModelRow` como **tipo canónico** (renombrar interno a `ModelRow` para mantener nombre corto ya usado por chart/columnas).
2. `ProfitabilityByModelReport.tsx`:
   - Reemplazar `import { AlertTriangle } from "lucide-react"` por el alias correspondiente del Icon registry (`AlertTriangleIcon` o el que exista; si no existe, agregar alias siguiendo el patrón del registry).
   - Eliminar `as ModelRow[]` (el hook ya devolverá el tipo compartido).
   - Eliminar variable espejo `chartRows`.
3. `profitabilityColumns.tsx` y `ProfitabilityChart.tsx`: cambiar el import de `ModelRow` para tomarlo desde el hook (`useProfitByModelReport`).
4. Eliminar archivo `profitabilityHelpers.ts` y su test `profitabilityHelpers.test.ts` (ya sin consumidores tras 1-3).
5. **Nuevo test** `useProfitByModelReport.test.ts`:
   - Mock de `supabase.rpc` que devuelve filas con `revenue`/`profit` como strings numéricos (comportamiento real de Postgres numeric) → verifica que el hook los convierte a `number`.
   - Caso `error` → el hook debe rechazar la promesa (y `useQuery` marcar `isError`).
   - Verifica `queryKey` estable dado el mismo rango (dos renders con la misma fecha reusan cache).

### B) Fundamento QuoteForm (preparación de UX-M1 sin migrar UI)

Migrar la UI completa de QuoteForm en un solo sprint es riesgoso (line-items dinámicos, descuentos, multi-moneda, `rental_meta`, autofills desde template/cotización). Esta ola sólo entrega la base validada y testeada; la migración de UI queda para Ola 3.5.

6. `src/features/quotes/lib/quoteFormSchema.ts` (nuevo):
   - `z.object` con los campos hoy manejados por `useQuoteFormState` (cliente, moneda, tasa IVA, fechas, notas, `line_items` como array).
   - `line_items` como `z.array(z.object({ ... }))` con `min(1, "Agrega al menos una partida")` y validación por tipo (renta requiere `forklift_id` + tarifa mensual; venta/servicio requieren descripción + precio > 0).
   - Refines cross-field: si hay línea de renta, `rental_meta.start_date` / `end_date` requeridos y `end_date >= start_date`.
7. `src/features/quotes/lib/__tests__/quoteFormSchema.test.ts` (nuevo):
   - Payload válido de una cotización sólo-renta.
   - Payload válido mixto renta + venta.
   - Rechazo: sin `customer_id`.
   - Rechazo: array de partidas vacío.
   - Rechazo: partida renta sin `forklift_id`.
   - Rechazo: `end_date < start_date` cuando hay renta.
   - Rechazo: partida venta con `unit_price ≤ 0`.

**Fuera de alcance en 3.4:** cambios en `QuoteForm.tsx` UI, en `useQuoteFormState`, o en las mutaciones — se abordarán en Ola 3.5 usando el schema como contrato.

### Verificación

- `bunx tsgo --noEmit` limpio.
- `bunx vitest run` — `1097 → ~1105` (aprox +8: 3 del hook, ~7 del schema, −2 de helpers eliminados).
- Reporte de rentabilidad visible en preview sin regresiones (mismo chart + tabla).
- Nueva entrada `public/changelog.json` + `public/changelog/v7.126.0.json`.
