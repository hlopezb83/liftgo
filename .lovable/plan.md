

## Página de Detalle MRR — Montacargas Rentados

### Objetivo
Crear una nueva página `/mrr` que muestre una tabla con todos los montacargas actualmente rentados, su tarifa mensual, el cliente al que están asignados, y el total (MRR).

### Origen de datos
El MRR se calcula de `forklifts WHERE status = 'rented'` sumando `monthly_rate`. Para mostrar el cliente, se cruza con la tabla `bookings` (reserva activa/confirmada) y de ahí con `customers`.

### Cambios

**1. Nueva RPC `get_mrr_detail`** — migración SQL
Función que retorna los montacargas rentados con su cliente actual:
- Consulta `forklifts` con `status = 'rented'`
- JOIN con `bookings` (status `confirmed`, fecha actual entre `start_date` y `end_date`) para obtener el `customer_id`
- JOIN con `customers` para obtener el nombre del cliente
- Retorna: `forklift_id`, `forklift_name`, `model`, `manufacturer`, `serial_number`, `monthly_rate`, `daily_rate`, `weekly_rate`, `customer_name`, `customer_id`, `booking_number`, `start_date`, `end_date`
- Incluye el total MRR como suma

**2. `src/hooks/useMrrDetail.ts`** — nuevo hook
Hook con `useQuery` que llama a `supabase.rpc("get_mrr_detail")`.

**3. `src/pages/MrrDetailPage.tsx`** — nueva página
- Header con título "Ingreso Mensual Recurrente" y subtítulo con el total MRR
- Tabla con columnas: Equipo, Modelo, Cliente, Reserva, Periodo, Tarifa Mensual
- Cada fila enlaza al detalle del montacargas (`/fleet/:id`)
- Fila de totales al final
- Botón de regreso al dashboard

**4. `src/routes.tsx`**
- Agregar ruta `/mrr` con `module: "Reportes"`

**5. `src/components/dashboard/FinancialKpiCards.tsx`**
- Cambiar el `href` de "Ingreso Mensual Recurrente" de `/income-statement` a `/mrr`

**6. `src/lib/changelog.ts`**
- Registrar nueva versión

### Archivos
- 1 migración SQL (nueva función RPC)
- `src/hooks/useMrrDetail.ts` (nuevo)
- `src/pages/MrrDetailPage.tsx` (nuevo)
- `src/routes.tsx`
- `src/components/dashboard/FinancialKpiCards.tsx`
- `src/lib/changelog.ts`

