
## Objetivo

Reducir ruido visual en el Gantt agrupando por modelo los montacargas sin actividad (Disponibles y Vendidos), en lugar de mostrar una fila por unidad.

## Cambios

### `src/features/calendar/components/calendar/GanttChart.tsx`
- Clasificar los `forklifts` en tres grupos:
  1. **Con renta activa o futura** — sigue igual, una fila por unidad (`GanttRow`).
  2. **Disponibles** — `status !== "sold"` y sin reservas activas/futuras en el rango.
  3. **Vendidos** — `status === "sold"` y sin reservas activas/futuras en el rango.
- Para los grupos 2 y 3, agrupar por `manufacturer + model` y renderizar **una sola fila resumen por modelo** con:
  - Etiqueta: `Manufacturer Model` + badge con el conteo (`× N`).
  - Sin barras de Gantt (no hay reservas que mostrar).
  - Estilo compacto consistente con `GanttRow` (mismo `w-48` izquierdo, fondo sutil `bg-muted/10` para diferenciar).
- Mantener el encabezado por sección con conteo total (unidades, no modelos): `Disponibles (12)`, `Vendidos (5)`.
- Ordenar las filas agrupadas alfabéticamente por `Manufacturer Model`.

### Nuevo componente `GanttGroupedRow.tsx`
- Componente pequeño y puro: recibe `label: string`, `count: number`, `days: Date[]` (para renderizar la grilla de fondo igual que `GanttRow`, manteniendo alineación visual de columnas).
- Sin tooltips ni segmentos.

### Sin cambios
- `useGanttSegments`, hooks, queries, vista Lista.
- La fila "Con renta activa o futura" sigue mostrando una fila por unidad con barras.

### Changelog
- `public/changelog/v6.20.3.json` (patch).
- Entrada en `public/changelog.json`.

## Detalles técnicos

```text
groupKey = `${manufacturer ?? ""} ${model}`.trim()
disponibles: forklifts sin actividad y status !== 'sold' → agrupar por groupKey
vendidos:    forklifts sin actividad y status === 'sold' → agrupar por groupKey
```

## Fuera de alcance
- Expandir/colapsar grupos, filtros, cambios en la vista Lista.
