## Problema

En `ExtendBookingDialog.tsx`, el `Popover` que envuelve al `<Calendar>` es no controlado: al seleccionar una fecha, `onSelect` actualiza el estado pero el Popover no recibe la señal de cerrarse.

## Fix

Convertir el Popover a controlado con un `useState<boolean>` local (`calendarOpen`), y en el `onSelect` del `Calendar`:
1. Setear la fecha (`setNewEndDate(d)`).
2. Cerrar el popover (`setCalendarOpen(false)`).

Cambio mínimo, un solo archivo: `src/features/bookings/components/bookings/ExtendBookingDialog.tsx`. No toca lógica de negocio ni el hook.

Agregar entrada de changelog patch (`v6.76.7`): "Modal Extender Renta: cerrar calendario al seleccionar fecha".
