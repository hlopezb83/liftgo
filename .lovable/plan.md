
## Sprint: Migración Kanbans → @dnd-kit (Lote F)

**Alcance:** reemplazar `@hello-pangea/dnd` por `@dnd-kit/*` en los 2 Kanbans existentes, sin cambiar UX ni lógica de negocio (reglas de guardas, optimistic updates, apertura de diálogo al mover a `cerrado_ganado`).

### Archivos afectados (7)

| Archivo | Rol tras migración |
|---|---|
| `src/features/crm/pages/CRMPage.tsx` | Cambia firma de `onDragEnd(result: DropResult)` → `onDragEnd(event: DragEndEvent)` |
| `src/features/crm/components/CRMKanbanGrid.tsx` | Monta `<DndContext>` + `<DragOverlay>` |
| `src/features/crm/components/KanbanColumn.tsx` | Usa `useDroppable` en lugar de `<Droppable>`; envuelve items en `<SortableContext strategy={verticalListSortingStrategy}>` |
| `src/features/crm/components/ProspectCard.tsx` | Usa `useSortable` en lugar de `<Draggable>` |
| `src/features/maintenance/components/maintenance/MaintenanceKanban.tsx` | Monta `<DndContext>` |
| `src/features/maintenance/components/maintenance/kanban/MaintenanceKanbanColumn.tsx` | `useDroppable` + `SortableContext` |
| `src/features/maintenance/hooks/maintenance/useMaintenanceKanban.ts` | Firma cambia a `DragEndEvent`; misma lógica de optimistic update |

### Dependencias

Instalar:
```
@dnd-kit/core@^6
@dnd-kit/sortable@^10
@dnd-kit/utilities@^3
```
Remover `@hello-pangea/dnd` una vez migrado y `tsgo` limpio.

### Diseño técnico

**Sensors (compartidos por ambos Kanbans):**
```ts
useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
```
`distance: 4` evita drags accidentales al hacer click en la card (que abre detalle). Con `@hello-pangea/dnd` esto no era problema porque distingue click vs drag internamente; en dnd-kit hay que declararlo.

**Detección de colisión:** `closestCorners` (comportamiento equivalente al de pangea para columnas verticales).

**Identidad:** `id` de draggables = `prospect.id` / `log.id`. Columnas droppables usan `id` = `stageKey` / `work_status`. Se agrega `data: { type: "card" | "column", ... }` a cada draggable/droppable para que el handler distinga en `onDragEnd`.

**Reordenamiento intra-columna (solo CRM):** El código actual llama `updateProspect({ id, stage_order: destination.index })`. Con dnd-kit se calcula el nuevo índice desde `over.data.current.sortable.index` (provisto por `SortableContext`). Se mantiene el mismo mutation.

**Cross-column:** Cuando `active.data.current.columnId !== over.data.current.columnId` se dispara la misma lógica actual (para CRM: abrir diálogo si es `cerrado_ganado`, sin persistir aún; para mantenimiento: optimistic update + mutation).

**DragOverlay:** Renderiza una copia visual de la card arrastrada mientras `activeId` está seteado — reemplaza el efecto `rotate-1 shadow-lg` que hoy va sobre el nodo original. Esto elimina el hack de `snap.isDragging` sobre la Card.

**Accesibilidad:** dnd-kit trae keyboard navigation (Space para tomar, arrows para mover, Space para soltar, Esc para cancelar) y announcements ARIA nativos — pangea también los tenía; se mantiene paridad.

### Verificación

1. `tsgo` limpio en los 7 archivos.
2. Playwright headless en `/crm` y `/mantenimiento`:
   - montar página, screenshot de estado idle
   - simular drag con `page.mouse.down/move/up` sobre una card hacia otra columna
   - verificar console 0 errores y screenshot posterior
3. Verificar que click simple en una card sigue abriendo el detalle (no dispara drag por el `activationConstraint`).
4. Verificar reordenamiento intra-columna en CRM (persistencia de `stage_order`).
5. Verificar guarda: mover una card a `cerrado_ganado` como usuario no-admin muestra el toast de error y revierte.

### Cierre

- Desinstalar `@hello-pangea/dnd`.
- Agregar entrada al changelog como **minor** (v7.58.0): "Migración de Kanbans (CRM + Mantenimiento) a @dnd-kit con mejor accesibilidad por teclado y DragOverlay nativo".

### Fuera de alcance

- No se toca UX del kanban (columnas, colores, densidad, filtros, toolbar).
- No se cambia lógica de negocio (guardas, mutations, side-effects al mover a ganado).
- No se agregan features nuevas (drag entre múltiples boards, virtualización, etc.).
