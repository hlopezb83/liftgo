
## Objetivo

Hacer el Gantt de Calendario de Disponibilidad más fácil de leer mostrando primero los montacargas con renta activa o futura, y agrupando al final los que están disponibles (sin reservas).

## Cambios

### 1. `src/features/calendar/components/calendar/GanttChart.tsx`
- Antes de renderizar las filas, clasificar `forklifts` en dos grupos usando `bookings` del rango visible:
  - **Con actividad**: tienen al menos una reserva `confirmed` en el rango (activa hoy o futura dentro del rango visible).
  - **Disponibles**: sin reservas en el rango.
- Ordenar cada grupo por `name` (alfabético, como hoy).
- Renderizar:
  1. Encabezado de sección "Con renta activa o futura" (`N`) — solo si hay elementos.
  2. Filas del grupo con actividad.
  3. Encabezado de sección "Disponibles" (`N`) — solo si hay elementos.
  4. Filas del grupo disponibles (con un fondo `bg-muted/20` sutil opcional para distinguirlos visualmente).
- Los separadores serán filas tipo sticky-left con texto pequeño (`text-xs font-semibold text-muted-foreground uppercase tracking-wide`), respetando el ancho de columna izquierdo (`w-48`) y extendiéndose sobre la grilla.

### 2. Sin cambios en lógica de negocio
- No se modifican hooks, queries ni el `EquipmentListView`.
- No se altera la semántica del status `forklifts.status` (solo se usa para mostrar el badge como hoy).
- La clasificación se basa en `bookings` del rango visible (consistente con lo que ya muestra el Gantt).

### 3. Changelog
- Crear `public/changelog/v6.20.2.json` (patch — mejora visual del Gantt).
- Agregar entrada en `public/changelog.json`.

## Detalles técnicos

```text
bookingsByForklift (Map ya existente en useGanttSegments)
  └── forklift tiene entry con al menos 1 booking confirmed dentro del rango → "Con actividad"
  └── sin entries / solo cancelled → "Disponibles"
```

Para evitar duplicar lógica, exponer un `Set<string>` `forkliftsWithActivity` desde `useGanttSegments` o calcularlo inline en `GanttChart` con un `useMemo` simple sobre `bookings`.

## Fuera de alcance
- Filtros adicionales, colapsar grupos, cambios en la vista Lista, o cambios en el status real de los montacargas.
