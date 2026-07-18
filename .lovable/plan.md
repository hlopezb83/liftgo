# DIFF 7b — Leyenda semántica del Gantt del Calendario

## Contexto verificado

Al releer `GanttChart.tsx` + `GanttRow.tsx`, el Gantt ya tiene:
- Leyenda **por cliente** (colapsable, mapa `customerColorMap`) — ya existe.
- Codificación visual **no documentada** en pantalla:
  - Barra sólida = reserva **confirmada** (activa/futura).
  - Barra atenuada + borde punteado = **completada** o **cancelada**.
  - Franjas grises verticales = **fin de semana**.
  - Línea vertical primaria = **hoy**.

El auditor externo pedía "leyenda de colores" pero, como ya existe la de clientes, el gap real es la **leyenda semántica de estados y marcadores**, que hoy el usuario tiene que adivinar. Eso es lo que aporta valor y encaja con el patrón del proyecto (auto-explicativo, alta densidad, desktop-first).

Descarto la interpretación literal del auditor (duplicar la leyenda de clientes) porque ya está resuelta.

## Alcance

Un cambio puntual en `src/features/calendar/components/calendar/GanttChart.tsx`:

1. Agregar una **segunda sección colapsable** (o un bloque hermano) justo antes/después de "Leyenda de clientes", titulada **"Leyenda"**, que documente:
   - Muestra sólida coloreada → *Confirmada*
   - Muestra atenuada con borde punteado → *Completada / Cancelada*
   - Cuadrito gris → *Fin de semana*
   - Línea vertical primaria → *Hoy*
2. Reutilizar `Collapsible` (ya importado) y los mismos tokens de tipografía/spacing que la leyenda de clientes para mantener consistencia visual.
3. Sólo se renderiza si hay `active.length > 0` (si no hay Gantt visible, no aporta).
4. Cero cambios en `useGanttSegments`, `GanttRow` o `GanttHeader` — la codificación visual ya está implementada, sólo se documenta.

## Detalles técnicos

- Archivo tocado: `src/features/calendar/components/calendar/GanttChart.tsx` (~+30 LOC, sin superar el límite de 150 LOC del componente: hoy tiene 146, quedaría ~175 → **extraer los dos bloques de leyenda a un subcomponente `GanttLegend.tsx`** para respetar Power of 10).
- Nuevo archivo: `src/features/calendar/components/calendar/GanttLegend.tsx` que reciba `customerColorMap` y renderice ambas secciones colapsables.
- Textos en es-MX, sin emojis, tipografía `text-xs`/`text-2xs` como el resto del componente.
- Sin cambios de estilos globales ni de tokens (`--gantt-*` se mantienen).

## Verificación

- `bunx tsgo --noEmit` limpio.
- `bun run lint` sin warnings nuevos.
- Playwright: screenshot de `/calendario` en 1600×900 mostrando ambas leyendas expandidas.
- Test unitario ligero para `GanttLegend` (render + toggle) si el subcomponente lo justifica.

## Cierre

- Entrada nueva en `public/changelog.json` + `public/changelog/v7.85.0.json` como **patch** (documentación visual, sin cambios funcionales).

## Alternativas descartadas

- **Duplicar la leyenda de clientes en otro formato**: ya existe, no aporta.
- **Rediseñar el color por status en vez de por cliente**: rompería la identificación visual de clientes recurrentes que hoy es útil para el equipo de operaciones. Fuera de alcance.
- **Mover la codificación a badges/StatusBadge dentro del row**: reduce densidad visual del Gantt (contraviene el core "alta densidad, desktop-first").

¿Procedo con este alcance o prefieres otra interpretación de 7b (por ejemplo, sólo documentar sin subcomponente, o incluir también íconos en `GanttHeader`)?
