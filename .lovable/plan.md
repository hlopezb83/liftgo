## Problema

En `ExtendBookingDialog.tsx` (botón "Extender Renta" del header de RSV):

1. **Fecha de fin actual**: muestra el valor crudo ISO (`YYYY-MM-DD`) en un `<Input disabled>`, no en formato mexicano.
2. **Nueva fecha de fin**: usa `<input type="date">` nativo, cuyo formato depende del locale del navegador (en muchos casos MM/DD/YYYY), no respeta es-MX.

## Cambios

Solo frontend, archivo único: `src/features/bookings/components/bookings/ExtendBookingDialog.tsx`.

1. **Fecha de fin actual (read-only)**: reemplazar el `<Input value={currentEndDate} disabled />` por un campo que muestre la fecha formateada con `formatDate` del proyecto (DD/MM/YYYY, timezone America/Monterrey). Parsear `currentEndDate` con el helper existente (sin `new Date(string)` directo).

2. **Nueva fecha de fin**: reemplazar el `<input type="date">` nativo por el patrón estándar Shadcn Datepicker del proyecto:
   - `Popover` + `Button` (trigger) + `Calendar` (`mode="single"`, `locale={es}` de `date-fns/locale`).
   - Estado interno como `Date | undefined`; mostrar `format(date, "dd/MM/yyyy", { locale: es })`.
   - `disabled` para fechas menores o iguales a `currentEndDate`.
   - Al confirmar, convertir el `Date` a `YYYY-MM-DD` usando `toYMD()` (regla de memoria: columnas `date` se serializan con `toYMD`, no `toISOString`) antes de pasarlo a `createExtension.mutate`.
   - Añadir `className="p-3 pointer-events-auto"` al Calendar (requerido dentro de Dialog).

3. No tocar el hook `useCreateBookingExtension` ni la lógica de negocio — el payload sigue siendo `new_end_date: 'YYYY-MM-DD'`.

4. Agregar entrada al changelog (`public/changelog.json` + `public/changelog/v{X.Y.Z}.json`) como **patch**: "Modal Extender Renta localizado a es-MX (DD/MM/YYYY)".

## Detalles técnicos

- Importar `es` desde `date-fns/locale`, `format` desde `date-fns`, `Calendar`, `Popover*`, `cn`, `CalendarIcon` (lucide), y `toYMD` / `formatDate` desde los utilitarios del proyecto.
- No introducir parseo manual con `new Date(string)`; usar los helpers existentes en `src/lib/date*` (a confirmar ruta al implementar).
- Sin cambios de schema, RLS, hooks compartidos ni otros consumidores.

## Fuera de alcance

- Botón duplicado en `BookingActions.tsx` (tema separado, ya en discusión previa).
- Cambios al diálogo legacy `BookingExtendDialog`.
