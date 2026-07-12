
## Auditoría post v10 (react-day-picker@10.0.1)

**Estado actual** (10 archivos, ninguno con API obsoleta):
- `src/components/ui/calendar.tsx` — wrapper v10 ya migrado (classNames camelCase, `Chevron`, locale nativo).
- `DatePickerField.tsx` / `DateRangePickerField.tsx` — modal shell propio, `mode="single" | "range"`, `autoFocus` ok.
- 5 consumidores usan sólo tipos `DateRange` / `Matcher` (correctos en v10).

## Oportunidades detectadas

1. **CSS legacy sobre `day`**: `calendar.tsx:35` conserva el hack v8 `[&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md`. En v10 el resaltado del rango ya lo cubren las claves `range_start` / `range_middle` / `range_end`, por lo que este selector duplica el estilo (y en algunos días con `outside` puede pintar accent doble).
2. **Falta `animate` prop** (v9.5+): la transición nativa al cambiar de mes/año es gratis y elimina la sensación de "salto".
3. **`defaultMonth` innecesario**: en v10 cuando `selected` está definido el DayPicker abre en el mes correcto por defecto. Podemos remover el fallback `defaultMonth={localDate ?? new Date()}` (RDP hace lo mismo internamente).
4. **`captionLayout` moderno no aprovechado**: para fechas que pueden estar lejos (nacimientos, fechas de compra, vencimientos de seguros) la navegación mes-por-mes es lenta. v10 ofrece `captionLayout="dropdown"` + `startMonth`/`endMonth` — 0 código extra nuestro, sólo pasar props opcionales.
5. **`required` para modo single**: cuando `date` es obligatorio, el usuario puede clickear el día seleccionado y quitarlo por accidente. `required` en v10 lo previene nativamente (elimina un edge case de validación).

## Plan de refactor

### 1. `src/components/ui/calendar.tsx`
- Añadir `animate` al `<DayPicker>` para transiciones nativas (~2 KB gz, ya presentes en el bundle).
- Simplificar el className de `day`: quitar el hack `[&:has([aria-selected])]:bg-accent ...` (redundante con `range_*`). Queda sólo `h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20`.
- Ajustar `range_middle` para pintar el fondo entre días (antes lo hacía el hack en `day`): `bg-accent text-accent-foreground rounded-none`.
- Ajustar `range_start` / `range_end`: heredan `selected` para el fondo primary; sólo redondean el extremo.

### 2. `src/components/forms/DatePickerField.tsx`
- Aceptar props opcionales `captionLayout?: "label" | "dropdown"` y `startMonth?`, `endMonth?` que se pasan al `<Calendar>`. Sin defaults nuevos — puramente aditivo para llamantes que quieran dropdowns (fechas remotas).
- Añadir `required?: boolean` que además de la etiqueta pase `required` al `<Calendar mode="single" required>` — evita deselect accidental.
- Remover `defaultMonth={localDate ?? new Date()}` (RDP v10 lo infiere de `selected`).

### 3. `src/components/forms/DateRangePickerField.tsx`
- Remover `defaultMonth={localRange?.from ?? new Date()}` por la misma razón.
- Sin cambio de API pública para los consumidores existentes.

### 4. Optimización de imports
- Ya tree-shaken: `DayPicker` y tipos vienen named. Locale desde subpath `react-day-picker/locale`. No hay barrels a limpiar.

### 5. Verificación
- `tsgo --noEmit`.
- Smoke visual: DatePicker single (formularios), DateRange (Reportes/Facturas) — que el resaltado del rango siga funcionando tras quitar el hack CSS.
- `bunx vitest run` completo.

### 6. Changelog
- Publicar `v7.54.0` — "react-day-picker v10: cleanup CSS, animate y features opcionales".

## Impacto estimado
- **LOC**: −4 líneas de CSS legacy + posibles opt-ins.
- **Bundle**: sin cambios (todo ya venía en el peso base de v10).
- **UX**: transición animada gratis, resaltado de rango más limpio, opción de dropdown de año/mes para fechas remotas.
