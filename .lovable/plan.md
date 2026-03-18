

# Plan: Página de Detalle de Reserva (Booking Detail)

## Resumen
Crear una nueva página `BookingDetail` que muestre toda la información de una reserva y centralice las acciones (extender, cancelar, cambiar estatus, crear contrato, devolución anticipada, eliminar). La tabla de reservas dejará de mostrar la columna "Acciones" y cada fila será clickeable para navegar a `/bookings/:id`.

## Cambios

### 1. Nueva página `src/pages/BookingDetail.tsx`
- Usa `useBooking(id)` (ya existe en el hook) para obtener la reserva por ID.
- Layout con `DetailPageHeader` (patrón existente en ContractDetail, ForkliftDetail):
  - Título: nombre del equipo
  - Subtítulo: nombre del cliente
  - Badge: estado actual
  - `backTo="/bookings"`
  - Acciones en el header: botones de Crear Contrato, Extender, Devolución Anticipada, Cambiar Estatus (admin), Cancelar, Eliminar (admin) — misma lógica que `BookingActions` pero con botones más visibles.
- Cards de información:
  - **Datos generales**: equipo, cliente, fechas inicio/fin, duración, facturación recurrente.
  - **Acciones/Estado**: diálogos de extender y cambiar estatus (reutilizando la lógica actual de `BookingActions`).

### 2. Actualizar `src/routes.tsx`
- Agregar ruta `{ path: "/bookings/:id", component: BookingDetail, module: "Reservas" }`.

### 3. Actualizar `src/pages/BookingsPage.tsx`
- Eliminar la columna "Acciones" del `tableHeader` y del `renderRow`.
- Hacer cada `TableRow` clickeable con `onClick={() => navigate(`/bookings/${b.id}`)}` y `cursor-pointer`.
- Reducir `skeletonColumns` de 7 a 6.
- Aplicar lo mismo en la tarjeta móvil.

### 4. Refactorizar `src/components/bookings/BookingActions.tsx`
- Extraer la lógica de acciones (handlers de extender, cancelar, cambiar estatus, eliminar) para que sea reutilizable tanto en la detail page como en cualquier otro contexto.
- O bien, reutilizar `BookingActions` directamente dentro de `BookingDetail` como componente de acciones del header.

### Patrón de referencia
Sigue el mismo patrón que `ForkliftDetail` y `ContractDetail`: header con acciones, cards de información, navegación desde la lista con click en la fila.

