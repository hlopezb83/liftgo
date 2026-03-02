

## Programar entrega para todos los montacargas al convertir cotizacion

### Problema
La conversion a reserva crea correctamente una reserva por cada montacargas, pero el dialogo de entrega solo se muestra para el primero. El segundo equipo queda con reserva confirmada pero sin entrega programada, y el usuario no recibe ningun aviso.

### Solucion
Convertir el estado `deliveryDialog` en un arreglo y recorrerlo secuencialmente: al completar o saltar la entrega del primer equipo, se muestra automaticamente el dialogo del siguiente, hasta terminar todos.

### Cambios

**1. `src/pages/QuoteDetail.tsx`**

- Reemplazar el estado `deliveryDialog` (objeto unico) por `pendingDeliveries` (arreglo) y `currentDeliveryIndex` (numero).
- En `convertToBooking` (lineas 111-121): construir el arreglo completo con todos los bookings creados (bookingId, forkliftId, forkliftName, startDate, customerAddress) y setear el indice a 0.
- Crear funcion `handleDeliveryNext()`: incrementa `currentDeliveryIndex`; si ya no quedan mas, limpia el estado y navega a `/calendar`.
- En el JSX (lineas 247-258): derivar el dialogo actual de `pendingDeliveries[currentDeliveryIndex]`; pasar `handleDeliveryNext` tanto a `onSkip` como al cierre exitoso.

**2. `src/components/PostBookingDeliveryDialog.tsx`**

- Agregar props opcionales `currentIndex` y `totalCount` (numeros).
- Si `totalCount > 1`, mostrar un indicador en el titulo del dialogo: "Entrega 1 de 2" para dar contexto al usuario de cuantas entregas faltan.
- Sin cambios en la logica de creacion de entrega; al completar exitosamente, llamar `onSkip` (que ahora avanza al siguiente en vez de cerrar todo).

### Flujo resultante

```text
Usuario: "Convertir a Reserva" (cotizacion con 2 montacargas)
  -> Se crean 2 reservas
  -> pendingDeliveries = [{ equipo1 }, { equipo2 }], index = 0
  -> Dialogo: "Entrega 1 de 2 - MCAPC025A048/001"
     Usuario programa o salta
  -> index = 1
  -> Dialogo: "Entrega 2 de 2 - MCAPC035A048/003"
     Usuario programa o salta
  -> Navegar a /calendar
```

