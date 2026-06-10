## Diagnóstico actual

`playwright.config.ts` corre con `fullyParallel: false` y `workers: 1` (8 specs, ~25 min de timeout en CI). El cuello no es Playwright — es la fixture de datos:

- `e2e_seed_scenario` y `e2e_teardown` (en `tests/e2e/fixtures/seed.ts`) **no aceptan un scope**: el teardown borra TODOS los datos `e2e_*` globalmente.
- Cualquier paralelismo (workers locales o shards CI concurrentes contra la misma DB Supabase) hace que el teardown de un test elimine el seed de otro a medio vuelo.

Por eso simplemente subir `workers` o agregar `--shard` no es seguro hoy.

## Plan en 3 fases (de menor a mayor ganancia/riesgo)

### Fase A — Sharding por matriz CI (rápido, ~2x sin tocar tests)

Aprovecha la matriz de GitHub Actions para correr shards en **jobs serializados** (no concurrentes a nivel DB) usando `max-parallel: 1`. Cada job ejecuta `bunx playwright test --shard=N/M`. Reparte la suite pero evita la condición de carrera del teardown global.

```text
e2e (shard 1/3) ─┐
e2e (shard 2/3) ─┼─ max-parallel: 1  (mismo Supabase, sin race)
e2e (shard 3/3) ─┘
```

- Ganancia real: ninguna en wallclock (es serial), pero **aísla fallos** y permite reintentar solo el shard caído.
- Costo: bajo, solo edita `.github/workflows/ci.yml`.

**Solo vale la pena si se acompaña de Fase B.** En su forma pura, Fase A no acelera nada.

### Fase B — Namespacing de la fixture de seed (clave para paralelizar)

Modificar la RPC `e2e_seed_scenario` y `e2e_teardown` para aceptar un parámetro `p_scope text` (ej. `shard-1`, `worker-2`, o `crypto.randomUUID()` por test). El teardown filtra por scope en lugar de borrar todo.

En la fixture TS:
- Generar scope = `${process.env.TEST_WORKER_INDEX ?? "0"}-${test.info().testId}` y propagarlo.
- Prefijar identificadores de seed (`customer_name`, `quote_number`, etc.) con el scope para evitar colisiones en índices únicos.

Una vez aislado el dataset por test:
- `fullyParallel: true` y `workers: process.env.CI ? 2 : 4` en `playwright.config.ts`.
- Ganancia esperada: **2-4x** dependiendo de recursos del runner.

### Fase C — Sharding CI concurrente (combinable con B)

Con datos namespaced ya es seguro correr shards en paralelo:

```yaml
strategy:
  fail-fast: false
  matrix:
    shard: [1, 2, 3]
steps:
  - run: bunx playwright test --shard=${{ matrix.shard }}/3
```

- Cada job paga su propio `bun install` + `playwright install` + `build` (~3-4 min de overhead fijo por shard).
- Ganancia combinada con Fase B: **3-4x wallclock** (25 min → 7-9 min) en suites pesadas. En la suite actual (8 specs), 2 shards × 2 workers es probablemente el sweet spot.
- Reportes: agregar paso para fusionar blobs con `npx playwright merge-reports`.

## Detalles técnicos

- `tests/e2e/global.setup.ts` ya escribe `storageState` — cada shard puede reutilizarlo si se cachea, o reauténticar (rápido). El paso `setup` ya está como `dependencies: ["setup"]` en el proyecto chromium, así corre una vez por shard.
- Migración SQL requerida en Fase B (no destructiva): `CREATE OR REPLACE FUNCTION e2e_seed_scenario(p_scope text DEFAULT 'default') ...` + filtro `WHERE scope = p_scope` en teardown. Default mantiene compat con tests no actualizados.
- El proyecto `portal` (sin auth) queda fuera del scoping — corre rápido solo.
- Riesgo principal: Supabase tiene rate limits y la DB es compartida; >4 shards concurrentes puede degradar más que ayudar.

## Recomendación

Saltar Fase A. Implementar **B + C juntas** con 2 shards × 2 workers como configuración inicial. Si necesitas que lo implemente, dame luz verde y arranco con la migración SQL del seed + el cambio de config.
