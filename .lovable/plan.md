
## Auditoría react-day-picker

**Versión actual**: `^8.10.2` · **Última estable**: `10.0.1` (mayor con breaking changes en v9 y v10).

**Superficie de uso** (10 archivos):
- `src/components/ui/calendar.tsx` — wrapper shadcn sobre `<DayPicker>` con `classNames` completo, `components.IconLeft/IconRight` y `locale={es}` de `date-fns/locale`.
- `src/components/forms/DatePickerField.tsx`, `DateRangePickerField.tsx` — consumen tipos `Matcher` / `DateRange`.
- `src/components/forms/fields/DateField.tsx`, `DateRangeField.tsx` — wrappers RHF.
- Consumidores de tipo `DateRange`: `ReportsPage`, `InvoicesToolbar`, `useAvailableForklifts`, `useBookingFormState`, `useQuoteFormState`.

**Problemas detectados**
1. API v8 obsoleta en `calendar.tsx`: `IconLeft` / `IconRight` (removidos en v9), keys de `classNames` estilo `nav_button`, `head_row`, `head_cell`, `row`, `cell`, `day`, `day_selected`, `day_today`, `day_outside`, `day_disabled`, `day_hidden`, `day_range_*`, `caption` — todas renombradas en v9/v10.
2. `locale` importado desde `date-fns/locale`: en v9+ RDP trae sus propios locales (`react-day-picker/locale`) permitiendo mejor tree-shaking (evita cargar todo `date-fns/locale`).
3. No se importan estilos base de v9 (necesarios si se usa Chevron / dropdowns nativos).
4. `components.IconLeft/IconRight` → API v9 unificada en `components.Chevron` que recibe `{ orientation }`.

## Plan de refactor

### 1. Bump de dependencia
- `react-day-picker`: `^8.10.2` → `^10.0.1` (peer: React 19 ✅, date-fns ≥4 ✅).

### 2. Reescribir `src/components/ui/calendar.tsx`
- Cambiar `locale` a `import { es } from "react-day-picker/locale"` (drop `date-fns/locale` import).
- Reemplazar `components.IconLeft/IconRight` por un único `Chevron` con `orientation`:
  ```tsx
  components={{
    Chevron: ({ orientation }) =>
      orientation === "left" ? <ChevronLeftIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />,
  }}
  ```
- Migrar el mapa `classNames` a las **nuevas claves v10** (camelCase):
  - `caption` → `month_caption`
  - `caption_label` → `caption_label` (igual)
  - `nav_button_previous/next` → `button_previous` / `button_next`
  - `head_row` → `weekdays`; `head_cell` → `weekday`
  - `row` → `week`; `cell` → `day`; `day` (botón) → `day_button`
  - `day_selected` → `selected`; `day_today` → `today`; `day_outside` → `outside`; `day_disabled` → `disabled`; `day_hidden` → `hidden`
  - `day_range_start/end/middle` → `range_start` / `range_end` / `range_middle`
- Añadir soporte oficial a `mode="range"` con `range_start/end/middle` (reemplaza el hack `[&:has([aria-selected])]` sobre `cell`).
- Mantener API pública (`CalendarProps = ComponentProps<typeof DayPicker>`) — consumidores no cambian.

### 3. Consumidores de tipos
- `Matcher` y `DateRange` siguen exportándose desde `react-day-picker` en v10 → **cero cambios** en:
  `DatePickerField.tsx`, `DateRangePickerField.tsx`, `DateField.tsx`, `DateRangeField.tsx`, `ReportsPage.tsx`, `InvoicesToolbar.tsx`, `useAvailableForklifts.ts`, `useBookingFormState.ts`, `useQuoteFormState.ts`.
- Verificar `onSelect` de rango: firma sigue `(range: DateRange | undefined, selectedDay, activeModifiers, e) => void` compatible.

### 4. Optimización de imports / tree-shaking
- Locale desde `react-day-picker/locale` (subpath export, sólo el objeto `es`, sin arrastrar el resto de `date-fns/locale`).
- Sin cambios en imports nombrados de `DayPicker`, `DateRange`, `Matcher` (ya son named).

### 5. Verificación
- `tsgo --noEmit` (tipos `Chevron`, `classNames` keys).
- Smoke visual: DatePicker en formularios, DateRange en Reportes/Facturas, footer con presets, indicadores de rango (start/end/middle).
- Test suite completa (`vitest run`).

### 6. Changelog
- Publicar `v7.53.0` — "react-day-picker v10".

## Estimación de LOC
- `calendar.tsx`: reescritura ~55 líneas (misma dimensión, sin bloat).
- Neto ≈ 0 LOC pero elimina API deprecada y una dependencia transitiva (`date-fns/locale` completo si sólo se usaba aquí — a validar en el bump).
