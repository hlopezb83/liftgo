## Objetivo

Dejar verde el shard 1/2 de Playwright: 1 fallo real (`crm-kanban.spec.ts`) y 1 flaky (`bank-reconciliation.spec.ts`).

## Estado verificado

- `tests/e2e/crm-kanban.spec.ts` mueve la tarjeta con el teclado (`Space` → `ArrowRight` → `Space`), apoyándose en el `KeyboardSensor` con `sortableKeyboardCoordinates` configurado en `CRMKanbanGrid.tsx`.
- Las columnas son droppables (`useDroppable` en `KanbanColumn.tsx`) y las tarjetas son sortables (`useSortable` en `ProspectCard.tsx`); `resolveDropTarget` en `CRMPage.tsx` acepta tanto columna como tarjeta como destino.
- El fallo se repitió en el reintento, así que **no** es flaky: el movimiento por teclado no llega a producir el cambio de columna en CI. La causa exacta aún **no está confirmada** (hipótesis: la columna destino vacía y el reposicionamiento de coordenadas del `KeyboardSensor` en headless).
- En bancos, el fallo fue timeout esperando la opción de la cuenta sembrada en el `Select` (`bank-account-select`) y pasó al reintentar: comportamiento de carrera/lentitud, no de lógica.

## Plan

### 1. Reproducir y diagnosticar (primero, sin cambiar código de producción)
- Correr localmente `bunx playwright test tests/e2e/crm-kanban.spec.ts` con traza y captura del DOM tras cada tecla, para confirmar si el drag arranca (`Space`) y qué `over` resuelve el `ArrowRight`.
- Confirmar si la columna destino está vacía en la corrida (el empty state es un `<button>` dentro del droppable) y si eso altera el cálculo de colisiones.

### 2. Corregir la causa raíz
Según lo que muestre el diagnóstico, una de estas dos vías:
- **Si el sensor de teclado no resuelve columnas vacías**: añadir en `CRMKanbanGrid.tsx` un `coordinateGetter` propio que, con `ArrowLeft`/`ArrowRight`, salte explícitamente a la columna hermana (usando los rects de los droppables de tipo `column`). Es además una mejora real de accesibilidad para usuarios de teclado.
- **Si el drag no arranca**: mover `listeners`/`attributes` al elemento correcto y garantizar `tabIndex`/`role` en la tarjeta, sin romper el `onClick` de apertura del detalle.

### 3. Estabilizar el test bancario
- En `openReconciliation` (`bank-reconciliation.spec.ts`), esperar explícitamente a que la opción exista antes de hacer clic (`expect(option).toBeVisible({ timeout: long })`) en vez de encadenar `click()` directo, y reintentar la apertura del `Select` una vez si la lista llegó vacía por la carga inicial.
- Subir el timeout del describe de 60s a 90s solo para el arranque frío de CI.

### 4. Validación
- `bunx playwright test tests/e2e/crm-kanban.spec.ts tests/e2e/bank-reconciliation.spec.ts --repeat-each=2`.
- `bun run lint` y los tests unitarios de `stageMove`.

### 5. Mantenimiento
- Nueva entrada de changelog (patch, v7.253.3) en `public/changelog.json` + `public/changelog/v7.253.3.json` y bump en `package.json`.

## Notas técnicas
- No se tocará la lógica de negocio de CRM (`stageMove.ts`, `useMoveProspectStage`): el movimiento optimista ya tiene pruebas unitarias; el problema está en la capa de interacción/dnd-kit o en el test.
