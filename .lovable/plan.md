# Auditoría date-fns

## Veredicto
Implementación **sólida** (v4, TZ centralizada en `nowMty`/`formatMtyDate`, locale `es` correctamente aislado en `date-fns/locale`, sin importar el bundle completo), pero **no top-of-the-line**: hay duplicación de patrones de formato y falta guardrail arquitectónico.

## Hallazgos

### 🟢 Lo que ya está bien
- `date-fns@4.4.0` + `date-fns-tz@3.2` (última compatible).
- Tree-shaking correcto: imports puntuales, nunca `import * from "date-fns"`.
- Locale `es` importado desde `date-fns/locale` (path estable v4).
- `toZonedTime` **solo** vive en `src/lib/utils.ts` (1 sitio) — TZ Monterrey encapsulada.
- Helpers canónicos existen: `nowMty()`, `formatMtyDate()`, `formatDateDisplay()`, `formatDateRange()`, `parseDateLocal()`, `formatMonthEs()`.

### 🟡 Duplicación evitable
1. **`format(new Date(row.created_at), "dd/MM/yyyy")`** repetido en **30+ componentes** (users, damage, inventory, invoices, fleet, feedback, audit…). Debería usarse `formatMtyDate(row.created_at)`.
2. **`import { es } from "date-fns/locale"`** duplicado en **11 archivos**. Un único re-export `APP_LOCALE` desde `@/lib/utils` (o `@/lib/format/locale`) elimina el import trasnochado.
3. **`format(nowMty(), "yyyy-MM-dd")`** copiado en 3 hooks de dashboard (`useMrrDetail`, `useFinancialKpis`, `useDashboardStats`) para armar query keys → helper `todayKeyMty()`.
4. **`format(d, "yyyy-MM-dd")`** para persistencia en form submit (contracts, maintenance…): ya existe `toYMD()` en el core rules — auditar migraciones faltantes.
5. **`parseISO`** vs `new Date(iso)` mezclados (64 vs muchos). En v4 ambos funcionan pero `parseISO` es más estricto y explícito para strings ISO — estandarizar hacia `parseISO`.

### 🟡 Falta de guardrail
- No hay regla ESLint que impida `import { format } from "date-fns"` fuera de la capa `lib/format`/`lib/utils`. Cualquier archivo puede reintroducir el patrón ad-hoc.
- Sin regla contra `format(new Date(), "dd/MM/yyyy")` inline (patrón obvio para code-review pero fugaz en PRs grandes).

### 🟡 TZ inconsistente en display
- `format(new Date(row.created_at), ...)` **no aplica** TZ Monterrey — usa TZ del navegador. Para columnas de auditoría en dashboard interno con usuarios en MX no se nota, pero para PDFs o exports puede desalinear a medianoche.
- `formatMtyDate` sí aplica TZ. Migrar los 30+ sitios cierra este bug latente.

## Plan de mejora

### Lote A · Helpers unificados (`src/lib/format/dateFormats.ts`)
Nuevo módulo con presets tipados:
```ts
export const DF = {
  dateShort: "dd/MM/yyyy",
  dateTime:  "dd/MM/yyyy HH:mm",
  dateLong:  "dd 'de' MMMM 'de' yyyy",  // con locale es
  dayMonth:  "dd MMM",
  isoDay:    "yyyy-MM-dd",
} as const;

export const APP_LOCALE = es;                      // único re-export
export const todayKeyMty = () => format(nowMty(), DF.isoDay);
export const formatDateTimeMty = (v) => formatMtyDate(v, DF.dateTime);
export const formatDateLongMty  = (v) => formatMtyDate(v, DF.dateLong, APP_LOCALE);
```

### Lote B · Migración masiva (subagentes)
- Reemplazar `format(new Date(x.created_at), "dd/MM/yyyy")` → `formatMtyDate(x.created_at)` en ~30 archivos.
- Reemplazar `format(new Date(x), "dd/MM/yyyy HH:mm")` → `formatDateTimeMty(x)` en 6-8 archivos (audit/activity).
- Sustituir 11 imports duplicados de `es` por `APP_LOCALE` desde `@/lib/format`.
- Reemplazar 3 usos de `format(nowMty(), "yyyy-MM-dd")` → `todayKeyMty()`.

### Lote C · Guardrails ESLint
- `no-restricted-imports` para `date-fns`:
  - Prohibir en `src/features/**` y `src/components/**`. Permitir sólo en `src/lib/format/**`, `src/lib/utils.ts`, `src/lib/pdf/**`, `src/lib/domain/rentalCalculation.ts`, `src/components/ui/calendar.tsx` (necesita `es` para react-day-picker).
- `no-restricted-syntax` (opcional) contra literales `"dd/MM/yyyy"` fuera de `lib/format`.

### Lote D · parseISO consistente (opcional, bajo impacto)
- Auditar los ~40 `new Date(isoString)` restantes y migrar a `parseISO` cuando la fuente sea DB. Reduce ambigüedad y facilita testing.

### Lote E · Changelog
- `v7.33.0` (minor): helpers unificados + migración + guardrails.

## Estimación
- ~120 líneas menos (30 sitios × ~2 líneas de import/format + 11 re-imports de locale).
- 1 bug latente corregido (TZ en display de `created_at`).
- Guardrail impide reintroducción.

## Riesgos
- **Bajo**. Cambio puramente presentacional, sin lógica de negocio.
- Tests visuales de audit/activity y dashboards para confirmar mismos strings.
