## Diagnóstico

El selector "brinca" porque `DateRangePickerField` usa un `Popover` con `numberOfMonths={2}`. En viewports estrechos (como el tuyo, 983px) Radix Popover hace *collision detection* y reposiciona el panel cada vez que cambia la altura/ancho del calendario (al navegar meses o al pasar de "from" a "to"). Además, cuando el `selected` cambia mid-interacción, react-day-picker recalcula el `defaultMonth` visible y el panel "salta" de mes.

## Solución

Convertir el rango de fechas a un **modal centrado** (Dialog) en lugar de un Popover, manteniendo `react-day-picker` (la librería que ya usa shadcn `Calendar` por debajo). El modal no depende de coordenadas del trigger, así que no se reposiciona nunca. Aprovecho para fijar el mes visible y dar control explícito Aplicar/Cancelar.

No se cambian las otras 4 pantallas que ya usan `DateRangePickerField` — solo mejoran al heredar el modal.

### Cambios

`src/components/forms/DateRangePickerField.tsx` — reescribir:

- Reemplazar `Popover`/`PopoverContent` por `Dialog`/`DialogContent` (shadcn) con `max-w-fit` y `p-4`.
- Mantener `Calendar` (react-day-picker) con `mode="range"`, `numberOfMonths={2}` en sm+ y `1` en mobile (via `useMediaQuery` ya existente, o `hidden sm:block`).
- Estado local `localRange` que solo se commitea al rango externo al presionar **Aplicar**.
- `defaultMonth={localRange?.from ?? new Date()}` fijo al abrir, para que el calendario no salte cuando seleccionas la segunda fecha.
- Header del modal con el rango formateado en vivo (DD/MM/YYYY → DD/MM/YYYY).
- Footer con botones **Cancelar** (descarta) y **Aplicar** (cierra + propaga `onSelect`); **Aplicar** se deshabilita si falta `from` o `to`.
- Botón secundario "Limpiar" cuando ya hay rango.

### Librería

Se reutiliza **react-day-picker** (ya instalado vía `@/components/ui/calendar`). No se agregan nuevas dependencias — `react-day-picker` es justamente la librería estándar para este caso y eliminar el Popover resuelve el problema de salto sin instalar nada extra.

Si prefieres una librería dedicada de rango (p. ej. `react-date-range`), dilo y la cambio; descarté esa ruta porque añade ~50KB y duplica utilidades que ya tenemos.

### Changelog

Nueva entrada `v6.79.1` (patch) — "Selector de rango de fechas: modal estable sin saltos".

## Fuera de alcance

- `DatePickerField` (fecha única) sigue igual; no presenta el problema.
- No se tocan los rangos en Invoices/Reports/Bookings más allá de heredar el modal.
