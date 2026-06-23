## Alcance

Aplicar el mismo patrón de **modal centrado** que usamos en `DateRangePickerField` a todos los selectores de fecha del proyecto, para eliminar saltos del popover en cualquier viewport.

Inventario de selectores que faltan migrar:

1. `src/components/forms/DatePickerField.tsx` — fecha única (usado en Cotizaciones, Mantenimiento, Daños, Pagos, Cuentas por Pagar, etc.).
2. `src/features/bookings/components/bookings/ExtendBookingDialog.tsx` — usa un `Popover`+`Calendar` inline.

## Cambios

### 1. `DatePickerField.tsx` (reescribir)

Mismo patrón que `DateRangePickerField`:

- `Dialog` + `DialogTrigger` asChild sobre el botón.
- `DialogContent max-w-fit p-0 gap-0` con header (título + fecha en vivo `DD/MM/YYYY`) y footer.
- Estado local `localDate`; se sincroniza al abrir.
- `Calendar mode="single"`, `defaultMonth={localDate ?? new Date()}`, `numberOfMonths=1`.
- Footer: **Limpiar** (deshabilitado si no hay fecha) · **Cancelar** · **Aplicar** (deshabilitado si no hay fecha).
- Acepta `disabled` opcional (rango de fechas no seleccionables) reenviado a `<Calendar disabled>` — útil para `ExtendBookingDialog` que bloquea fechas anteriores.
- Acepta `error?: string` para paridad con el range field.
- Mantiene la firma actual (`label`, `date`, `onSelect`, `placeholder`, `required`) — todos los consumidores siguen funcionando sin cambios.

### 2. `ExtendBookingDialog.tsx`

- Quitar import e implementación inline de `Popover` + `Calendar`.
- Usar `<DatePickerField>` con `disabled={(date) => date <= currentEndDate}` (misma regla actual).
- Nested Dialog: el modal del picker se monta sobre el dialog de extensión; shadcn lo soporta sin overlays duplicados.

### 3. Changelog

Nueva entrada `v6.79.2` (patch): "Selector de fecha única: modal estable replicando el patrón del rango".

## Fuera de alcance

- Los selectores nativos `<input type="date">` (si los hay en formularios sueltos) no se tocan en este pase.
- No se modifican los pickers de hora (no existen en la app actualmente como popovers problemáticos).
- No se cambia visualmente nada de las pantallas que ya consumen estos fields; solo cambia el modo de apertura.
