# Auditoría de cleanup E2E

Revisé `tests/e2e/**`, los fixtures (`seed.ts`, `portalSeed.ts`), `global.teardown.ts`, `playwright.config.ts` y las RPCs `e2e_teardown(p_scope)` + `purge_e2e_data()`. El diseño general (scope por test + purge global como red) es sólido, pero encontré varias fugas concretas y un bug de orden.

## Hallazgos

### 1. CRÍTICO — `maintenance_logs` no se borra en ningún teardown
`e2e_seed_scenario` crea una orden de mantenimiento (`seed.maintenance_log_id`, usado por `maintenance-kanban.spec.ts`), pero ni `e2e_teardown(p_scope)` ni `purge_e2e_data()` tienen `DELETE FROM public.maintenance_logs`. Cada corrida de la suite deja una orden huérfana ligada a un forklift sembrado; al borrar el forklift sin cascade, o bien falla el delete (si hay FK), o bien la fila queda perpetuamente. Confirmado por `grep`: cero referencias a `DELETE … maintenance_logs` en migraciones.

### 2. CRÍTICO — `customer-create.spec.ts` no usa `try/finally`
Líneas 80–90: el `select`, los `expect(...).toBe(...)` y el `delete` corren en secuencia plana. Si cualquier `expect` o el `select` falla, el `delete` nunca se ejecuta y el cliente queda en BD (marcado `is_e2e=true`, pero `purge_e2e_data()` solo corre en el último shard del global teardown — ver hallazgo 5). Además no llama `e2e_teardown` por scope, solo `delete by id`.

### 3. ALTO — `seed.ts` revisa `testInfo.status` antes de tiempo
En `fixtures/seed.ts` (líneas 109–115) el fixture lee `testInfo.status` para decidir si propaga el error de teardown o solo lo loguea. Playwright finaliza `testInfo.status` **después** de que terminan todos los fixtures de teardown, por lo que dentro del fixture casi siempre es `undefined`/`"running"`. La heurística cae al fallback de `testError`/`testInfo.errors.length`, lo cual funciona la mayoría de las veces, pero el chequeo de `status` es código muerto/engañoso. Mismo patrón en `portalSeed.ts`.

### 4. ALTO — `purge_e2e_data()` desactualizado vs. tablas con bandera `is_e2e`
La RPC global solo limpia 9 tablas: `activity_feed`, `payments`, `invoices`, `bookings`, `quote_assigned_forklifts`, `quotes`, `forklifts`, `equipment_models`, `customers`. Faltan:
- `maintenance_logs` (hallazgo 1)
- Cualquier otra tabla nueva con `is_e2e` añadida después de v6.37.3 (revisar `supplier_bills`, `damage_records`, `contracts` si se les agregó la columna)
Si el último shard llama esta RPC esperando "red final", esas tablas siguen acumulando filas.

### 5. MEDIO — Global teardown sólo corre en el último shard
`playwright.config.ts` desactiva `globalTeardown` cuando `SHARD_INDEX !== SHARD_TOTAL`. Si el último shard cae (OOM, timeout, build error), la purga nunca se ejecuta y la BD demo queda contaminada hasta la siguiente corrida exitosa. Falta una alerta o job dedicado de purga post-suite en CI.

### 6. MEDIO — `customer-create.spec.ts` inyecta `liftgo:e2e=true` vía `addInitScript`
Activa el flag para *toda* navegación del test, incluyendo páginas que podrían disparar otras escrituras (analytics, telemetry, prefetch de hooks). Hoy `getE2ECustomerMetadata` solo se usa en `buildCustomerPayload`, pero si mañana otro hook lee `liftgo:e2e_scope`, podría marcar filas con un scope que nadie limpia (porque el spec borra `customers` directo por id, no por scope).

### 7. BAJO — Fixture `seed.ts`: `teardownScenario` no incluye `maintenance_log_id` ni `payments` creados por la UI con bandera apagada
El comentario del RPC dice "borra pagos del scope o pagos que apuntan a facturas sembradas" — bien. Pero si un test futuro toca otras tablas (ej. `damage_records`, `contracts`), no quedan cubiertas. Sin tests automatizados que verifiquen "después del teardown, el scope no debe tener filas", la regresión es silenciosa.

## Plan de remediación propuesto (a aplicar tras tu aprobación)

1. **Migración SQL**:
   - Añadir `DELETE FROM public.maintenance_logs WHERE is_e2e = true AND (e2e_scope = p_scope OR p_scope IS NULL)` a `e2e_teardown(p_scope)` (antes de borrar `forklifts`).
   - Añadir el bloque equivalente a `purge_e2e_data()` (antes de `forklifts`).
   - Verificar columnas `is_e2e`/`e2e_scope` en `maintenance_logs`; si faltan, agregarlas con default y constraint de scope obligatorio (como las otras 7 tablas).

2. **`customer-create.spec.ts`**: envolver verificación + delete en `try/finally`; agregar fallback `await client.rpc("e2e_teardown", { p_scope: e2eScope })` en el `finally` para cubrir cualquier fila colateral.

3. **`seed.ts` y `portalSeed.ts`**: eliminar el chequeo de `testInfo.status` y dejar solo `testError`/`testInfo.errors.length`. Documentar por qué.

4. **CI**: agregar un job programado (cron diario) o un step de "post-suite hard purge" que ejecute `purge_e2e_data()` aunque el último shard haya fallado. Alternativa: emitir warning si la RPC devuelve totales > 0 en una corrida limpia.

5. **Test de regresión**: un spec rápido `tests/e2e/_meta/teardown.spec.ts` que siembre un scope, lo destruya y consulte `SELECT count(*) FROM public.<cada tabla> WHERE e2e_scope = $scope` esperando 0 en todas. Detecta automáticamente si una tabla nueva queda fuera del teardown.

## Detalles técnicos

- Las RPCs viven en `supabase/migrations/2026061222391…` (purge) y la última versión de `e2e_teardown` en `20260624163200_…`. Hay que crear una nueva migración (no editar las existentes).
- `e2e_seed_scenario` ya marca `maintenance_logs` con `is_e2e/e2e_scope` (asumido, a confirmar leyendo la versión vigente de la función antes de migrar).
- El job actual de CI usa sharding 2× con `fullyParallel: true`, `workers: 2`; el plan no cambia el modelo de paralelismo.

¿Aplico estas correcciones (1–3 son las urgentes) o quieres que primero confirme alguna asunción (por ejemplo, si `maintenance_logs` ya tiene `e2e_scope`)?
