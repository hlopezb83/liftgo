

# Plan: Editar estatus de reserva

## Situación actual
Las reservas tienen 3 estados posibles: `confirmed`, `completed`, `cancelled`. Actualmente solo se puede cancelar (vía RPC `cancel_booking`) pero no hay forma de cambiar manualmente entre estados — por ejemplo, reactivar una reserva completada o marcarla como completada.

## Solución
Agregar un botón "Cambiar Estatus" en `BookingActions` (visible solo para admins) que abra un diálogo con un selector de estado. Las transiciones válidas serían:
- **confirmed** → completed, cancelled
- **completed** → confirmed (reactivar)
- **cancelled** → confirmed (reactivar)

Al cambiar a `cancelled` se usará el RPC existente `cancel_booking` (que libera el montacargas). Para los demás cambios se usará `useUpdateBooking`.

## Cambios

### 1. `src/components/bookings/BookingActions.tsx`
- Agregar estado `statusDialogOpen` y un diálogo con un `<Select>` que muestre los estados válidos según el estado actual.
- El botón "Cambiar Estatus" será visible para admins en **cualquier** estado (no solo `confirmed`).
- Al confirmar el cambio: si el nuevo estado es `cancelled`, usar el RPC `cancel_booking`; de lo contrario, usar `updateBooking.mutate` con el nuevo status.
- Reestructurar el early-return en línea 45 para que los admins siempre vean el botón de cambiar estatus junto con el de eliminar.

### 2. Icono y UX
- Usar el icono `RefreshCw` de lucide para el botón "Cambiar Estatus".
- El diálogo mostrará el estado actual como badge y un selector con las opciones válidas.

No se requieren cambios en la base de datos — la columna `status` es un campo `text` sin constraint de enum.

