

# Plan: Páginas de Detalle para Entregas y Devoluciones

## Propuesta

Siguiendo el mismo patrón establecido con Reservas (BookingDetail), crear dos nuevas páginas de detalle:

- **DeliveryDetail** (`/deliveries/:id`): Muestra información completa de la entrega/recolección con acciones de completar (con firma) y eliminar.
- **ReturnInspectionDetail** (`/returns/:id`): Muestra toda la información de la inspección de devolución, fotos, notas de daños y datos del equipo.

En ambos casos, las filas de la tabla se vuelven clickeables y se eliminan las columnas/botones de acciones inline.

## Cambios

### 1. Nueva página `src/pages/DeliveryDetail.tsx`
- Hook `useDelivery(id)` (query individual por ID, reutilizando el select existente con joins de forklifts).
- `DetailPageHeader` con título `delivery_number`, subtítulo con nombre del equipo, badge de status, `backTo="/deliveries"`.
- Acciones en header: Completar (con diálogo de firma, reutilizando SignaturePad), Eliminar (con RoleGuard).
- Cards: **Tipo y Fecha** (tipo, fecha programada, hora), **Equipo** (nombre, modelo), **Logística** (dirección, operador, teléfono), **Notas**.
- Mover la lógica de `markComplete` y el diálogo de PostDeliveryPickupDialog aquí.

### 2. Nueva página `src/pages/ReturnInspectionDetail.tsx`
- Hook `useReturnInspection(id)` (query individual con joins de bookings y forklifts).
- `DetailPageHeader` con título `inspection_number`, subtítulo con equipo y cliente, badge de condición, `backTo="/returns"`.
- Cards: **Equipo** (nombre, modelo), **Reserva** (cliente, periodo), **Inspección** (fecha, condición, inspector, nivel de combustible, horas de uso), **Daños** (notas, costo), **Fotos** (galería de imágenes si existen).

### 3. Actualizar `src/routes.tsx`
- Agregar `{ path: "/deliveries/:id", component: DeliveryDetail, module: "Entregas" }`
- Agregar `{ path: "/returns/:id", component: ReturnInspectionDetail, module: "Entregas" }`

### 4. Actualizar `src/pages/DeliveriesPage.tsx`
- Eliminar columna de acciones (botones completar/eliminar) del `renderRow` y mobile cards.
- Hacer filas clickeables con `onClick={() => navigate(`/deliveries/${d.id}`)}` y `cursor-pointer`.

### 5. Actualizar `src/pages/ReturnInspectionPage.tsx`
- Hacer filas clickeables con `onClick={() => navigate(`/returns/${ins.id}`)}` y `cursor-pointer`.
- Mobile cards también clickeables.

### 6. Agregar hooks individuales
- `useDelivery(id)` en `useDeliveries.ts`
- `useReturnInspection(id)` en `useReturnInspections.ts`

### 7. Bump versión en changelog

## Patrón de referencia
Mismo patrón que `BookingDetail`: `DetailPageHeader` + cards de información + acciones centralizadas en el header.

