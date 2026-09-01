# Facturación recurrente: aclarar y poder activarla desde la reserva

## Qué encontré

Consulté las reservas RSV-0032 y RSV-0033 (LOGISTORAGE, 26-ago-2026 → 25-ago-2027, renta mensual $18,500): ambas tienen la facturación recurrente **apagada** en la base de datos. La tabla no muestra el badge porque efectivamente no son recurrentes.

Lo que confunde es el detalle: la tarjeta "Facturación" muestra la fila **"Facturación recurrente"** con el valor en blanco (el badge solo se dibuja cuando está activa), y se lee como si la reserva sí la tuviera.

Por qué se crearon apagadas: ambas nacieron de una cotización el 27-ago. El diálogo "Convertir cotización" trae el interruptor de facturación recurrente **apagado por defecto**, y ese texto promete "puedes desactivarla después desde la reserva" — pero hoy en el detalle de la reserva no existe ningún control para activarla o desactivarla.

## Qué haré (solo interfaz, sin tocar reglas de negocio)

1. **Detalle de reserva — valor explícito**
  En la tarjeta "Facturación", la fila "Facturación recurrente" mostrará siempre un valor claro: el badge "Recurrente" cuando está activa, y "No activa" cuando no lo está. Se acaba el campo en blanco.
2. **Poder activar/desactivar desde la reserva**
  Agregar un interruptor en esa misma tarjeta, visible solo para roles con permiso de edición y solo mientras la reserva no esté cancelada/completada. Usa la ruta de actualización que ya existe (con bloqueo optimista de versión), sin nuevas funciones ni cambios de permisos en el backend. Al cambiarlo se refresca el detalle y el listado.
3. **Convertir cotización — sugerencia inteligente**
  Cuando la cotización cubre uno o más meses calendario, el interruptor de "Facturación recurrente mensual" vendrá **encendido por defecto** (el usuario puede apagarlo). Esto evita que rentas de largo plazo se conviertan sin recurrencia por descuido. No cambia el RPC ni la lógica de facturación.
4. **Tabla de reservas — consistencia**
  El badge sigue igual (solo aparece si es recurrente), pero se agrega el título accesible/tooltip para que quede claro que su ausencia significa "no recurrente".
5. **Estos dos casos concretos**
  RSV-0032 y RSV-0033 no se tocan por script: una vez publicado el punto 2, tú las activas desde la pantalla de la reserva, y queda registrado en la bitácora como cambio de usuario.

## Detalles técnicos

- `BookingBillingCard.tsx`: valor explícito + `Switch` conectado a `useUpdateBooking` (`recurring_billing`, `expectedVersion: booking.version`), respetando `useUserRole`.
- `ConvertQuoteDialog.tsx`: estado inicial `recurring = canRecur` en lugar de `false`.
- `BookingsPage.tsx` / `RecurringBillingBadge.tsx`: solo texto de ayuda; sin cambio de lógica.
- Sin migraciones SQL, sin cambios en RLS, triggers, `create_booking`, `convert_quote_to_bookings`, ni en el motor de facturación recurrente.
- Changelog: nueva entrada minor (7.415.0) + archivo MD de versión.  
  
Corrige esas reservas bajo el principio YAGNI y corrige para que no vuelva a suceder. 