

# Cambiar grafica de Utilizacion de Flota a vista semanal

## Cambio solicitado
Actualmente la grafica muestra utilizacion por unidad individual (barras horizontales por montacargas). El cambio es mostrar la **utilizacion total de la flota por semana** con:
- **Eje X (abajo)**: Numero de semana (Sem 1, Sem 2, etc.)
- **Eje Y (izquierda)**: Porcentaje de utilizacion de toda la flota (0-100%)
- **Barras verticales**: Una barra por semana

## Como se calcula
Para cada semana de las ultimas 12 semanas:
- Se cuenta cuantos montacargas activos existen (no vendidos ni retirados)
- Se cuenta cuantos dias-montacargas estuvieron reservados esa semana (cruzando bookings con los 7 dias de la semana)
- Utilizacion = (dias reservados / dias disponibles totales) x 100

## Cambios tecnicos

### 1. Base de datos: Actualizar funcion `get_dashboard_stats`
Agregar un nuevo campo `weekly_utilization` al JSON que retorna la funcion. Este campo contiene un arreglo de las ultimas 12 semanas con:
- `week_label`: "Sem 5", "Sem 6", etc.
- `utilization`: porcentaje de 0 a 100

La consulta SQL calcula por cada semana: cuantos dias de la semana cada montacargas activo tenia una reserva activa, dividido entre el total de dias-montacargas disponibles.

### 2. Hook: `useDashboardStats.ts`
Agregar el tipo `weekly_utilization` al interface `DashboardStats`.

### 3. Dashboard: `Dashboard.tsx`
Crear el `useMemo` para mapear `stats.weekly_utilization` y pasarlo como prop al componente de graficas.

### 4. Componente: `UtilizationCharts.tsx`
- Cambiar la grafica de utilizacion de `layout="vertical"` (barras horizontales por unidad) a barras verticales por semana
- Eje X: numero de semana
- Eje Y: porcentaje (0-100%)
- Tooltip mostrando el % al pasar el cursor

### 5. Grafica de per-unit se mantiene
La grafica de "Ingresos por Unidad" no se modifica.

