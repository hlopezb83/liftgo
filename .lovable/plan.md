
# Detalle al hacer clic en Actividad Reciente

## Que cambia
Actualmente, al hacer clic en una tarjeta de actividad te lleva a la pagina de lista (ej. `/invoices`). Con este cambio, te llevara directamente al registro especifico (ej. `/invoices/abc-123`), y para las entidades que no tienen pagina de detalle, seguira llevandote a la lista.

## Como funciona
Cada registro de actividad ya tiene guardado el `entity_id` (UUID del registro) y el `entity_type` (nombre de la tabla). Solo hay que construir la ruta correcta combinando ambos.

## Cambios tecnicos

### Archivo: `src/pages/ActivityPage.tsx`
- Actualizar el mapa `ENTITY_ROUTES` para incluir todas las entidades que tienen pagina de detalle con rutas parametrizadas:
  - `forklifts` -> `/fleet/:id`
  - `invoices` -> `/invoices/:id`
  - `contracts` -> `/contracts/:id`
  - `quotes` -> `/quotes/:id`
  - `customers` -> `/customers/:id`
  - `bookings` -> `/calendar` (no tiene detalle individual, se queda en lista)
  - `return_inspections` -> `/returns` (lista)
  - `maintenance_logs` -> `/maintenance` (lista)
  - `damage_records` -> `/damages` (lista)
  - `deliveries` -> `/deliveries` (lista)
  - `payments` -> `/invoices` (lista)
- Modificar la funcion `onClick` para reemplazar `:id` con `a.entity_id` cuando la ruta lo contenga
- Agregar estas entidades faltantes al filtro de tipos (`ENTITY_TYPES` y `ENTITY_LABELS`)

### Archivo: `src/components/dashboard/RecentActivity.tsx`
- Aplicar la misma logica de navegacion a detalle en el widget del Panel, para que al hacer clic en una actividad reciente tambien te lleve al registro especifico

## Resultado
- Clic en "Creacion de Factura" -> te lleva a `/invoices/{uuid}` directamente
- Clic en "Actualizacion de Montacargas" -> te lleva a `/fleet/{uuid}`
- Clic en "Creacion de Reserva" -> te lleva a `/calendar` (no hay pagina de detalle)
