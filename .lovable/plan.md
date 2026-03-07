

## Plan: Devolución Anticipada navega al formulario de devoluciones (v3.17.4)

### Problema
El botón "Devolución Anticipada" en `BookingActions` solo cambia la fecha de fin de la reserva. El usuario quiere que en su lugar abra el formulario completo de inspección de devolución (el mismo de `/returns`).

### Solución
Reemplazar el dialog inline de "Devolución Anticipada" en `BookingActions` por una navegación a `/returns?booking_id={booking.id}`. En `ReturnInspectionPage`, leer el query param y auto-abrir el dialog con esa reserva pre-seleccionada.

### Archivos

**1. `src/components/BookingActions.tsx`**
- Eliminar el estado `returnOpen`, `earlyReturnDate`, `handleEarlyReturn`, el `returnPreview` y el `Dialog` de devolución anticipada
- Cambiar el botón "Devolución Anticipada" para navegar a `/returns?booking_id=${booking.id}`

**2. `src/pages/ReturnInspectionPage.tsx`**
- Importar `useSearchParams` de react-router-dom
- Leer `booking_id` del query string
- En un `useEffect`: si hay `booking_id` y existe en `activeBookings`, abrir el dialog y pre-seleccionar esa reserva via `set("bookingId", bookingId)`
- Limpiar el query param después de procesar

**3. `src/lib/changelog.ts`** — v3.17.4

