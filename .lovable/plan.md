# Plan: CRM Kanban más usable

## Problema observado
En la captura (1366px de ancho útil ~999 CSS px), la última columna **"Cerrado Perdido"** queda cortada y "Cerrado Ganado" apenas se ve. Con 6 columnas de 256px + gaps + padding se requieren ~1640px, por lo que siempre hay scroll horizontal incómodo y los usuarios no notan que existe la columna final.

## Objetivos
1. Que las 6 etapas quepan o se vean claramente sin "perder" columnas.
2. Reducir fricción visual del pipeline (densidad, jerarquía, descubribilidad).
3. No tocar lógica de negocio: solo presentación (memoria del proyecto: cambios UI = solo frontend).

## Cambios propuestos

### 1. Layout responsivo del tablero (alta prioridad)
- **Columnas con ancho fluido**: pasar de `w-64` fijo a `w-[clamp(220px,18vw,280px)]` para que se ajusten al viewport.
- **Cerrados colapsables**: agrupar **Cerrado Ganado** + **Cerrado Perdido** en una sección "Cerrados" plegable a la derecha (chip con conteos `Ganados 12 · Perdidos 4`); al hacer clic se expanden inline. Esto libera ~520px y deja las 4 etapas activas siempre visibles.
- **Indicador de scroll mejorado**: el fade derecho actual no comunica que hay 2 columnas más. Añadir un botón flotante `→ Cerrados (16)` cuando estén ocultas.

### 2. Selector de vista (densidad)
Toggle en el header: **Compacto / Cómodo**.
- *Compacto*: tarjetas con 1 línea (empresa + valor), columnas de 220px.
- *Cómodo*: tarjeta actual.

### 3. Header de columna más informativo
- Conteo + total ya existen.
- Añadir mini-barra de progreso del valor relativo al total del pipeline (visual de "dónde está el dinero").
- Hover en el punto de color: tooltip con la descripción de la etapa.

### 4. Tarjeta de prospecto: jerarquía
- Empresa en `font-semibold` (ya está) pero subir a `text-sm leading-snug` y truncar a 2 líneas con `line-clamp-2`.
- Valor `$` en `text-sm font-semibold text-foreground` (hoy es `text-xs muted`) — es el dato más importante del CRM.
- Mover `creado por · fecha` a un footer en `text-[10px]` separado por una línea sutil.
- Badge de cotización: si existe, mostrar también monto de la cotización (más útil que solo el folio).

### 5. Acciones rápidas
- Menú contextual (botón `⋮` al hover de la tarjeta) con: *Editar · Mover a... · Eliminar*. Hoy mover requiere drag, lo cual es difícil en trackpad cuando la columna destino no se ve.
- Atajo de teclado `N` para nuevo prospecto (ya hay Ctrl+K global, mantener consistencia).

### 6. Filtros adicionales (header)
Junto al filtro por creador actual:
- **Búsqueda** por empresa/contacto (input con debounce).
- **Rango de valor** (chips: `< $100k`, `$100k–$500k`, `> $500k`).
- **Antigüedad** (chips: `Esta semana`, `Este mes`, `> 30 días`) — útil para detectar prospectos estancados.

### 7. Señales de prospectos estancados
- Si un prospecto lleva > 14 días en la misma etapa, mostrar un punto naranja en la esquina superior derecha de la tarjeta con tooltip "Sin movimiento hace X días". Apoya el flujo de venta sin agregar lógica de backend (se calcula con `updated_at` del prospecto).

## Archivos a tocar
- `src/pages/CRMPage.tsx` — header con filtros nuevos, toggle densidad, agrupación Cerrados.
- `src/components/crm/KanbanColumn.tsx` — ancho fluido, mini-barra, tooltip.
- `src/components/crm/ProspectCard.tsx` — jerarquía, menú `⋮`, indicador de estancamiento, soporte densidad.
- (Nuevo) `src/components/crm/ClosedStagesGroup.tsx` — sección plegable Ganados/Perdidos.
- (Nuevo) `src/hooks/crm/useCRMFilters.ts` — agrupar filtros actuales + nuevos.
- `public/changelog.json` + `public/changelog/v5.60.0.json` — changelog (minor por mejora notable de UX, sin cambios de datos).

## Fuera de alcance
- Cambios de esquema de DB o de etapas del pipeline (la conversación previa ya cubrió que "Contactado" se mantiene).
- Métricas/reportes de conversión entre etapas (lo dejamos para una iteración futura si lo pides).
