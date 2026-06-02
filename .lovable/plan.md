
## Diagnóstico (UI/UX)

Captura visual: `/calendar` en vista Gantt → Mes. Detecté estos problemas:

1. **Etiqueta "HOY" sobrepuesta al número del día** en la cabecera (se monta encima del "2"). Es ilegible y luce como bug.
2. **Toolbar ambigua**: las flechas y el botón "Hoy" no tienen tooltip ni texto que explique qué hacen. El usuario no sabe si navegan mes/semana o algo más.
3. **Doble información en cada barra rentada**: el badge azul "Rentado" se monta sobre el nombre del cliente, generando overlap y ruido. La existencia de la barra ya implica que está rentado.
4. **Filas "Disponibles" y "Vendidos" desperdician espacio**: son agrupadas por modelo pero ocupan una fila completa de Gantt con la grilla de días vacía a la derecha. La grilla no aporta nada porque no hay barras.
5. **Marcador de "hoy" como columna pintada** compite con las barras y los fines de semana; un línea vertical fina es más limpia.
6. **Identificadores largos** (`HPLTC015A0762/002`) sin truncado se llevan demasiado ancho de la columna izquierda.
7. **Leyenda inferior duplica** los nombres de cliente que ya aparecen escritos sobre cada barra.
8. **Cards de stats se cortan** en 1000px (el cuarto card "Utilización" queda parcialmente fuera).

## Cambios

### 1. `GanttHeader.tsx` — fix "HOY" overlap y marcador
- Eliminar la etiqueta "HOY" superpuesta al número del día.
- Reemplazarla por:
  - El número del día con `bg-primary text-primary-foreground` redondo cuando es hoy (sin texto extra).
  - Una línea vertical de 1px (`bg-primary`) que cruza toda la grilla en la columna de hoy, marcada en el body.
- Compactar la cabecera para que weekday + día queden en una sola celda alineada.

### 2. `CalendarPage.tsx` — toolbar legible
- Añadir `tooltip` a los botones de navegación con texto contextual:
  - `ChevronLeft` → "Mes anterior" / "Semana anterior" según `ganttRange`.
  - `Hoy` → "Ir a hoy".
  - `ChevronRight` → "Mes siguiente" / "Semana siguiente".
- Agregar `aria-label` matching.

### 3. `GanttRow.tsx` — barras más limpias
- Quitar el badge `StatusBadge` ("Rentado") del lado izquierdo de la fila (la sección "Con renta activa o futura" ya lo comunica).
- Mantener solo el nombre del montacargas en la columna izquierda.
- Truncar nombres largos con `truncate` + `title` para tooltip nativo.
- El nombre del cliente sigue dentro de la barra coloreada; sin overlap.

### 4. `GanttChart.tsx` — Disponibles y Vendidos compactos
- Reemplazar las filas de Gantt vacías para Disponibles y Vendidos por una sola sección compacta tipo "chip cloud":
  - Una fila por sección con chips: `LIFT GO FB25 × 7`, `LIFT GO FB35 × 9`, etc.
  - Sin grilla de días (no hay reservas que mostrar ahí).
  - Mucho menor altura, foco visual queda en las barras de renta activa.

### 5. `GanttRow.tsx` + `GanttGroupedRow.tsx` — línea vertical de "hoy"
- Reemplazar el fondo `bg-primary/10 border-x border-primary/30` por una línea de 1px posicionada absoluta sobre la grilla (un solo elemento en `GanttChart`, no por celda) para evitar ruido y mejorar performance.

### 6. Leyenda inferior
- Mantener pero envuelta en un `Collapsible` cerrado por default ("Ver leyenda de clientes (N)") para reducir scroll y duplicación visual.

### 7. Stat cards responsivos
- En `CalendarStatCards.tsx`, asegurar `grid-cols-2 md:grid-cols-4` con `gap-3` para que no se corten a 1000px (verificar el componente actual y ajustar si hace falta).

### Fuera de alcance
- Sticky left column / sticky header (mejora futura, mayor refactor).
- Cambios al modo Lista o a los hooks de bookings.
- Filtros adicionales.

### Changelog
- `public/changelog/v6.20.4.json` (patch — mejoras UX del Gantt).
- Entrada en `public/changelog.json`.

## Detalles técnicos

```text
Línea de hoy:
GanttChart
  └── div className="relative"
      ├── header
      ├── absolute top-0 bottom-0 w-px bg-primary (left: % calc)
      └── rows

Chip cloud Disponibles/Vendidos:
<section>
  <header sticky/>
  <flex wrap gap-2>
    {groups.map → <chip>LIFT GO FB25 <span class="opacity-60">× 7</span></chip>}
  </flex>
</section>
```
