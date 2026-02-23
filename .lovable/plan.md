
# Corregir Dashboard y estandarizar paginas de lista

## 1. Dashboard: agregar estado "sold" (Vendido)

El panel actual no contempla montacargas vendidos. El campo `total` de la funcion `get_dashboard_stats` los incluye, pero no hay un conteo separado ni aparece en el grafico de pie.

### Cambios:

**Base de datos** - Actualizar la funcion `get_dashboard_stats` para:
- Agregar `'sold', COUNT(*) FILTER (WHERE status = 'sold')` al bloque `fleet_counts`
- Excluir equipos vendidos y retirados del calculo de utilizacion (actualmente los incluye todos)

**`src/hooks/useDashboardStats.ts`**:
- Agregar `sold: number` a la interfaz `fleet_counts`

**`src/pages/Dashboard.tsx`**:
- Agregar `sold` al mapa de `STATUS_COLORS` con el color `hsl(200, 15%, 45%)` (mismo que `--status-sold`)
- Incluir "Vendidos" en el `pieData` del grafico de pie
- Agregar una stat card "Vendidos" con icono apropiado
- Ajustar "Flota Total" para mostrar solo la flota activa (excluyendo vendidos y retirados), o agregar una nota visual que distinga activos de total

## 2. Fleet: migrar a ListPageLayout

La pagina `Fleet.tsx` construye manualmente la estructura de header, filtros, tabla y paginacion. Se puede simplificar usando `ListPageLayout`, pero tiene una particularidad: la vista mobile usa cards en lugar de tabla.

### Cambios en `src/pages/Fleet.tsx`:
- Reemplazar la estructura manual por `ListPageLayout`
- Usar la prop `customContent` para la vista mobile (cards)
- Mover los filtros (search + select de estado) a la prop `filters`
- Mantener la misma funcionalidad y apariencia visual

## 3. CustomersPage: migrar a ListPageLayout

Mismo patron que Fleet pero mas sencillo (no tiene vista mobile diferenciada).

### Cambios en `src/pages/CustomersPage.tsx`:
- Reemplazar la estructura manual de `PageTransition > div > PageHeader > Card > Table` por `ListPageLayout`
- Mover el search input a la prop `filters`
- Mantener el Dialog de crear/editar cliente fuera del layout (se agrega despues del `ListPageLayout`)

## Secuencia de implementacion

1. Migracion SQL para actualizar `get_dashboard_stats`
2. Actualizar tipo en `useDashboardStats.ts`
3. Actualizar `Dashboard.tsx` con color y datos de "sold"
4. Refactorizar `Fleet.tsx` con `ListPageLayout`
5. Refactorizar `CustomersPage.tsx` con `ListPageLayout`
