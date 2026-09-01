# Plan: Explicar el bloqueo de "Eliminar reserva" en estado Confirmada

## Diagnóstico (confirmado)

El "error" que reporta el usuario **no es un bug del backend**: la RPC `delete_booking` rechazó correctamente la eliminación de la reserva `9478ce67…` porque está en estado `confirmed` y la regla de negocio exige cancelarla primero (mensaje P0001).

El problema real está en la UI, en `src/features/bookings/components/bookings/BookingActions.tsx`:

- Para reservas `confirmed`, el admin ve el botón **"Eliminar" habilitado** (línea 108), aunque esa acción **siempre** va a fallar en el servidor.
- Al fallar, el error llega como reporte genérico `DB_PERMISSION_DENIED` ("Error al eliminar reserva") en vez de explicar la regla: *cancela primero, luego elimina*.

Es exactamente el patrón de la iniciativa "bloques de acción explicables": el backend ya es la autoridad; falta que la UI anticipe y explique el bloqueo.

## Cambios (solo frontend/presentación; backend intacto)

1. **`src/lib/rules/businessBlocks.ts`**
   - Nuevo código `booking_not_final_for_delete`:
     - action: "No puedes eliminar esta reserva"
     - reason: "La reserva sigue confirmada (activa)."
     - nextStep: "Primero usa Cancelar y después podrás eliminarla."
   - Agregar patrón a `ERROR_PATTERNS` para reconocer el mensaje del RPC (`/Solo se pueden eliminar reservas canceladas o completadas/i`), de modo que si el error llega por otra vía, se muestre como bloqueo explicable y no como reporte de error.

2. **`src/features/bookings/components/bookings/BookingActions.tsx`**
   - Reemplazar el botón "Eliminar" por `BlockedActionButton` (primitiva existente en `src/components/feedback/`).
   - Cuando `booking.status === "confirmed"`, pasar el bloque `booking_not_final_for_delete`: el botón queda visible pero deshabilitado, con tooltip que explica la regla y el siguiente paso (usar Cancelar, que está justo al lado).
   - Cuando el estado es `cancelled`/`completed`, el botón funciona como hoy.
   - El diálogo de confirmación y la mutación `delete_booking` no cambian.

3. **Pruebas**
   - Test de `resolveBusinessBlock` con el mensaje real del RPC (ya existe el archivo de tests `BlockedAction.test.tsx` / tests del catálogo).
   - Test del componente: botón deshabilitado con tooltip en estado `confirmed`, habilitado en `cancelled`.

4. **Versionado**: bump patch a `7.414.3` + entrada en `CHANGELOG.md` / `changelog.json`.

## Lo que NO cambia
- `delete_booking` RPC, triggers, RLS, máquina de estados: intactos. La regla sigue viva en el servidor; esto solo evita que el usuario la descubra a través de un error feo.
