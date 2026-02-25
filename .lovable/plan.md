
# Pagina de listado de Reservas

## Problema actual
El enlace "Reservas" en el sidebar lleva directamente al formulario de nueva reserva (`/bookings/new`). No existe una pagina dedicada para ver todas las reservas existentes.

## Solucion
Crear una pagina `BookingsPage` en `/bookings` que muestre un listado de todas las reservas con filtros, busqueda y paginacion, siguiendo el mismo patron que `ContractsPage` usa con `ListPageLayout`.

## Cambios

### 1. Crear `src/pages/BookingsPage.tsx` (nuevo)
- Usar `ListPageLayout` como todas las demas paginas de listado
- Columnas de la tabla: Equipo, Cliente, Fecha inicio, Fecha fin, Duracion, Estado, Acciones
- Filtros por estado: Todas, Confirmadas, Completadas, Canceladas
- Barra de busqueda por nombre de equipo o cliente
- Paginacion con `usePagination`
- Vista mobile con cards (como ContractsPage)
- Boton "Nueva Reserva" que lleva a `/bookings/new`
- Cada fila clickeable mostrando los detalles inline o navegando al calendario
- Incluir `BookingActions` y `RecurringBillingBadge` en cada fila

### 2. Actualizar `src/components/AppSidebar.tsx`
- Cambiar el enlace de "Reservas" de `/bookings/new` a `/bookings`
- Agregar rol `auditor` a la lista de roles permitidos (para consistencia con otros modulos)

### 3. Actualizar `src/App.tsx`
- Agregar lazy import de `BookingsPage`
- Agregar ruta `/bookings` con roles `["admin", "dispatcher", "administrativo", "auditor"]`
- La ruta existente `/bookings/new` se mantiene sin cambios

## Patron a seguir
Se replica exactamente el patron de `ContractsPage`:
- `useListFilters` para busqueda y filtro de estado
- `usePagination` para paginar resultados
- `ListPageLayout` para el layout consistente
- Cards responsivas en mobile
