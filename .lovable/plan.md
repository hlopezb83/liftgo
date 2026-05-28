## Problema

Al asignar un equipo a una cotización de venta aceptada, el equipo no aparece como asignado hasta hacer un hard reload (Ctrl+Shift+R).

## Causa raíz

En `src/features/fleet/hooks/forklifts/useAssignForklifts.ts`, la mutación `useAssignForklift` ejecuta **3 pasos secuenciales** dentro de `mutationFn`:

1. `INSERT` en `quote_assigned_forklifts` (la asignación en sí)
2. `UPDATE` masivo del status de `forklifts` a `'sold'`
3. `INSERT` en `status_logs`

La invalidación de queries (`quote_assigned_forklifts`, `forklifts`, `status_logs`) está en `onSuccess`. Si **cualquiera de los pasos 2 o 3 falla** (p.ej. un policy de RLS sobre `status_logs`, un timeout transitorio, una restricción), `mutationFn` lanza error → React Query va a `onError` → **nunca se invalidan las queries**, aunque el paso 1 (la asignación) ya quedó persistido en la base de datos.

Resultado: la asignación existe en DB, pero el cache local sigue mostrando el estado anterior. Un Ctrl+Shift+R fuerza un fetch nuevo y aparece.

El mismo patrón existe en `useUnassignForklift` (delete + update + insert log), así que tiene el mismo riesgo.

## Solución

Mover la invalidación de queries de `onSuccess` a `onSettled` en ambas mutaciones (`useAssignForklift` y `useUnassignForklift`). `onSettled` corre siempre, tanto en éxito como en error, garantizando que el cache se sincronice con la DB sin importar si fallaron los pasos secundarios (status del equipo, log).

El toast de éxito y el `onError` (toast de error) se mantienen como están — solo se separa la responsabilidad de refrescar datos.

### Archivos afectados

- `src/features/fleet/hooks/forklifts/useAssignForklifts.ts` — mover `invalidateQueries` a `onSettled` en ambos hooks.

### Verificación

- `bun run lint` y `bunx vitest`.
- Nueva entrada `6.13.7` (patch / bugfix) en `public/changelog.json` + `public/changelog/v6.13.7.json` describiendo "Refrescar UI de asignación de equipos aunque falle un paso secundario".

### Lo que NO se cambia

- La lógica de negocio (orden de operaciones, status `sold`, logs) se mantiene.
- No se tocan los componentes `AssignForkliftsCard` ni `AssignForkliftsLineRow`.
- No se modifica RLS ni la base de datos.
