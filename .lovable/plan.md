
# Agregar estado "Vendido" a montacargas

## Resumen

Agregar el estado "sold" (Vendido) a los montacargas para registrar cuando un equipo ha sido vendido. Los equipos vendidos se comportaran de manera similar a los retirados: no estaran disponibles para reservas ni se contaran en las metricas de utilizacion.

## Cambios

### 1. Constantes (`src/lib/constants.ts`)
- Agregar `"sold"` al array `FORKLIFT_STATUSES`
- Agregar `sold: "Vendido"` al objeto `STATUS_LABELS`

### 2. StatusBadge (`src/components/StatusBadge.tsx`)
- Agregar estilo visual para el estado `sold`. Se usara un color distintivo (similar a `retired` pero diferenciado, por ejemplo un tono azul gris).

### 3. Calendario - Estadisticas (`src/components/calendar/CalendarStatCards.tsx`)
- Actualizar el calculo de `totalActive` para excluir tambien los montacargas con estado `"sold"`, ya que un equipo vendido no forma parte de la flota activa.

### 4. Disponibilidad para reservas (`src/hooks/useAvailableForklifts.ts`)
- Los montacargas con estado `"sold"` ya se excluyen automaticamente porque el filtro actual solo permite `status === "available"`. No requiere cambios.

### 5. Colores de Tailwind (`tailwind.config.ts`)
- Agregar un color `status.sold` para dar al badge un color propio (por ejemplo un gris azulado).

### 6. CSS variables (`src/index.css`)
- Agregar la variable CSS `--status-sold` con el valor del color elegido.

### 7. Sin cambios en base de datos
- La columna `status` en la tabla `forklifts` es de tipo `text` sin restriccion de check, por lo que acepta cualquier valor. No se necesita migracion.

## Resultado

- Aparecera "Vendido" como opcion en los filtros de la lista de flota, en el formulario de creacion/edicion, y en el selector de cambio de estado del detalle del montacargas.
- El badge mostrara un color unico para equipos vendidos.
- Los equipos vendidos no se contaran como parte de la flota activa ni estaran disponibles para reservas.
