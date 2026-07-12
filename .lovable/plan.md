## Auditoría de `date-fns` (v4.1.0)

**Estado actual**: Ya migrada a v4, sin APIs deprecadas en uso, imports named ESM correctos (Vite tree-shake OK), `date-fns/locale/es` importado granularmente. `date-fns-tz` solo se usa en `src/lib/utils.ts` (`toZonedTime`) y sigue siendo necesario. Presets centralizados en `src/lib/format/dateFormats.ts` y `src/lib/format/formatMonthEs.ts`.

**Deuda detectada** (violación de la regla "SIEMPRE usar helpers"):

| # | Patrón inline | Ocurrencias | Helper canónico |
|---|---|---|---|
| 1 | `format(d, "yyyy-MM-dd")` | 16 sitios | `toYMD(d)` (ya existe en `src/lib/date/toYMD.ts`) |
| 2 | `format(d, "dd/MM/yyyy")` | 7 sitios | `formatDateMty(d)` |
| 3 | `format(d, "MMMM yyyy" \| "MMM yyyy", { locale })` | 3 sitios | `formatMonthLongEs` / `formatMonthShortEs` |
| 4 | `format(d, "dd MMM" \| "dd MMMM yyyy", { locale })` | 4 sitios (cash-flow, damage) | Nuevos helpers `formatDayMonthMty` / `formatDateLongMty` |
| 5 | `format(d, "d" \| "EEE", { locale })` en GanttHeader | 2 sitios | Aceptable inline (labels de calendario altamente localizadas) |

**Optimización de importaciones**: Ya óptima. `date-fns@4` es ESM puro; los `import { format, parseISO } from "date-fns"` se tree-shakean sin `date-fns/format`. No hay que migrar a subpath imports.

**APIs modernas de v4 no aprovechadas**: ninguna aplicable — `format`, `differenceInDays`, `parseISO`, `startOfMonth`, `isWithinInterval` no cambiaron. `format` con `in` option (TZ) existe pero ya usamos `formatMtyDate` (wrapper con `toZonedTime`) que cumple el mismo rol.

---

## Plan de refactor

**Fase A — Extender helpers centrales** (`src/lib/format/dateFormats.ts`):
- Añadir `formatDateLongMty(v)` → `"12 de julio de 2026"` (usando `DATE_PATTERNS.dateLong`).
- Añadir `formatDayMonthMty(v)` → `"12 jul"` (usando `DATE_PATTERNS.dayMonthShort`).
- Re-exportar `toYMD` desde `@/lib/format` para tener un solo entry point de helpers de fecha.

**Fase B — Barrer `format(d, "yyyy-MM-dd")` → `toYMD(d)`** (16 sitios):
- `useBookingFormSubmit.ts`, `useBookingActions.ts`, `useExtendBookingPreview.ts`
- `quoteFormBuilders.ts`, `useRecordPaymentForm.ts`, `useMonthlyData.ts`
- `maintenanceFormHelpers.ts`, `DeliveryFormDialog.tsx`, `ContractForm.tsx`
- `reconciliationExport.ts` (ya usa `dd/MM/yyyy` — mover a `formatDateMty`)

**Fase C — Barrer `format(d, "dd/MM/yyyy")` → `formatDateMty(d)`** (7 sitios):
- `DatePickerField.tsx`, `DateRangePickerField.tsx`
- `RecurringBillingBadge.tsx`, `prospectMapper.ts`
- `reconciliationExport.ts`

**Fase D — Migrar formatos de mes/día largo**:
- `SupplierBillsFilters.tsx`, `CalendarPage.tsx` → `formatMonthLongEs` / `formatMonthShortEs`.
- `DamageDetailSheet.tsx` → `formatDateLongMty`.
- `cashFlowUtils.ts` (2 sitios) → `formatDayMonthMty`.

**Fase E — Verificación**:
- `bunx tsgo --noEmit`
- `bun test` (997 unit tests deben seguir en verde)
- `bun run build` para confirmar bundle size sin regresión
- Publicar `changelog v7.47.0` (minor: DX/consistencia, sin cambios de comportamiento)

### Alcance excluido
- `GanttHeader.tsx` (`"EEE"`, `"d"`): son primitivos del calendario, no ganan legibilidad con helper.
- Refactor de `parseISO` → `parseYMD` local: fuera de scope; ya se documenta que `parseISO` con strings `yyyy-MM-dd` produce UTC drift, pero cada callsite ya normaliza vía `nowMty`/`toYMD`.
- Migración a subpath imports (`date-fns/format`): innecesaria en v4 ESM.

### Impacto esperado
- **−0 KB gzip** en bundle (los helpers ya arrastran `format`); ganancia es puramente de mantenibilidad y consistencia con la regla de memoria "SIEMPRE vía formatMtyDate / formatMonthEs".
- **~35 líneas eliminadas** por consolidación de patrones repetidos.
- Zero risk: helpers son wrappers de las mismas funciones.
