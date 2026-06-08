
## ¿Tiene sentido para LiftGo (zona MX)?

**Sí, pero como medida preventiva, no porque hoy haya un bug visible.** Análisis:

- `react-day-picker` entrega `Date` en **medianoche local**. En Monterrey (UTC-6/-5) la medianoche local cae en UTC del **mismo día** (ej. 8 jun 00:00 MTY = 8 jun 06:00 UTC), así que `.toISOString().slice(0, 10)` da "2026-06-08" correctamente. No vemos el clásico bug de "se corre un día" porque MX siempre tiene offset negativo.
- El bug **sí** aparece si en algún lado se construye un `Date` desde una cadena UTC (`new Date("2026-06-08")` = 8 jun 00:00 UTC = **7 jun 18:00 MTY**) y luego se formatea con `format(...)` o se vuelve a serializar. Hoy ya hay `nowMty()` para "ahora", pero no hay un helper `toYMD(date)` que extraiga el año/mes/día **locales** de un `Date`.
- Usar `.toISOString().slice(0,10)` en todos los consumidores es **frágil**: el día que alguien arrastre una `Date` UTC al serializador, perdemos un día sin darnos cuenta.

Conclusión: vale la pena estandarizar con un helper `toYMD()` basado en componentes locales y usarlo en `DateRangePickerField` + todos los hooks que serializan rangos para Supabase como `date`/`YYYY-MM-DD`. Las columnas `timestamptz` (`created_at`, `inspected_at`, etc.) se quedan con `toISOString()` — esas sí necesitan UTC.

## Plan

### 1. Nuevo helper `src/lib/date/toYMD.ts`
```ts
export function toYMD(date: Date | undefined | null): string | undefined {
  if (!date) return undefined;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```
Test asociado en `src/lib/date/__tests__/toYMD.test.ts` verificando que un `Date` creado con `new Date(2026, 5, 8)` siempre devuelve `"2026-06-08"` independiente del offset.

### 2. `src/components/DateRangePickerField.tsx`
- Mantener firma `onSelect(range?: DateRange)` (no romper API), pero **normalizar** el `Date` recibido del calendario a medianoche local antes de emitir:
  ```ts
  const normalize = (d?: Date) => d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : undefined;
  ```
  Esto garantiza que si en el futuro `react-day-picker` cambia el comportamiento o alguien pre-llena con una `Date` UTC, el callback siempre recibe medianoche local pura.
- Mismo cambio en `src/components/DatePickerField.tsx` para consistencia.

### 3. Migrar serializadores `.toISOString().slice(0,10)` → `toYMD()` cuando el destino es columna `date` (no `timestamptz`):
- `src/features/bookings/hooks/useBookings.ts` (líneas 25-26)
- `src/features/fleet/hooks/forklifts/useAvailableForklifts.ts` (líneas 13-14)
- `src/features/fleet/hooks/forklifts/useForkliftMutations.ts` (línea 19, expense_date)
- `src/features/invoices/hooks/invoices/useInvoicesFilters.ts` (líneas 51-53)
- `src/features/expenses/components/expenses/ExpenseEditDialog.tsx` (línea 96, expense_date)
- `src/features/dashboard/components/dashboard/AlertsRow.tsx` (línea 53, paid_at)

**NO** tocar las que apuntan a `timestamptz` (created_at de audit, inspected_at, closed_at, signed_at, etc.) — esas deben seguir siendo UTC ISO completo.

### 4. Memoria de proyecto
Agregar memoria `mem://logic/date-serialization`: "Para columnas DB tipo `date` usar `toYMD()` (componentes locales). Para `timestamptz` usar `nowMty().toISOString()` o `date.toISOString()`. Nunca `.toISOString().slice(0,10)` sobre `Date` que pueda venir en UTC."

### 5. Changelog
Entrada `6.22.6` patch en `public/changelog.json` + `public/changelog/v6.22.6.json` documentando el helper y la migración.

## Archivos tocados

- nuevo: `src/lib/date/toYMD.ts` (+ test)
- `src/components/DateRangePickerField.tsx`, `src/components/DatePickerField.tsx`
- 6 hooks/componentes listados en §3
- `public/changelog.json`, `public/changelog/v6.22.6.json`
- memoria del proyecto

Sin DB, sin RPCs, sin cambios de UI visibles.
