# Preparación local de Postgres.js 4

Estado: **preparación, no migración**. Base `0d11cc69a0df7e39e3787f7d432b4e5ad16a583e`.
`package.json` y `bun.lock` conservan Postgres.js **3.4.9**. No se descargó,
cargó ni ejecutó Postgres.js 4. No se ejecutaron bases, SQL ni integraciones.
Node sigue fijado en **26.13.0** en el proyecto; el ejecutable local disponible
para estos contratos es **v24.22.1**, por lo que no acreditan Node 26.

La elegibilidad de 4.0.0 empieza el **30-oct-2026 18:02:56.730 UTC**
(**12:02:56.730 Monterrey, UTC−6**). La publicación de esta preparación y la
instalación futura requieren su autorización correspondiente; no se espera
ese horario dentro de esta tarea.

## Cambio acotado

`scripts/lib/postgres-factory.cjs` conserva la función CommonJS v3 o resuelve
el `default` callable de una namespace ESM. Rechaza formas inválidas antes de
crear un cliente; no modifica opciones. Cinco consumidores CJS usan ese helper:

- `scripts/tests/recurring-invoice-locking.test.cjs`
- `scripts/test-invoice-settlement-reconciliation.cjs`
- `scripts/tests/reports/income-statement-documents.cjs`
- `scripts/tests/reports/income-statement-calculations.cjs`
- `scripts/tests/operations/run-completed-recurring-lifecycle.cjs`

La [guía oficial v4](https://github.com/porsager/postgres/blob/v4.0.0/README.md#upgrading-from-v3)
documenta el cambio de CommonJS a ESM. Resolver la exportación no valida el
protocolo, las consultas ni la serialización de la nueva versión.

## Evidencia offline

Comando, apuntando únicamente a dependencias ya instaladas:

```powershell
$env:LIFTGO_OFFLINE_DEPENDENCIES = 'C:\Users\torta\Documents\Codex\2026-10-29\task-3\liftgo-node26'
node --test scripts/tests/postgres-compat-offline.test.cjs
```

Resultado: **10 PASS, 0 FAIL**, con `process.version=v24.22.1`.
El intento inicial falló en una comprobación previa innecesaria: faltaba el manifest
local del cliente Postgres en esa instalación Windows. El contrato corregido
verifica el pin del lock sin importar el runtime del cliente.

Los contratos bloquean conexiones TCP y ejecutan el código instalado de
Drizzle **0.45.4** con clientes falsos. Comprueban resultados arrays/objetos,
`.values()`, parámetros y placeholders, flags de prepared queries, mapper,
errores y sus causas, clientes de `begin`/`savepoint`, retornos y rechazos.
Los marcadores `OFFLINE_*` sólo llegan a mocks y no son SQL ejecutado.

El driver real muta ocho parsers/serializers de fecha/array y dos serializers
JSON, según [driver.ts](https://github.com/drizzle-team/drizzle-orm/blob/0.45.4/drizzle-orm/src/postgres-js/driver.ts#L28).
La sesión exige el thenable y callbacks descritos en
[session.ts](https://github.com/drizzle-team/drizzle-orm/blob/0.45.4/drizzle-orm/src/postgres-js/session.ts).
Los tests verifican esas interfaces, no el motor ni rollback/savepoints reales.

Se confirma un escenario modelado de incompatibilidad: el constructor por
conexión del `driver.cjs` instalado no admite la namespace fake de v4, mientras
que un cliente explícito evita esa construcción. No se editó Drizzle ni se
cargó v4 para comprobarlo. Drizzle Kit **0.31.11** usa importación dinámica y
`postgres.default`; no comparte automáticamente ese caso. El peer `>=3` y la
devDependency `^3.3.5` de Drizzle ORM no acreditan validación con v4.

## Checklist posterior a elegibilidad y autorización

- Verificar loaders reales bajo Node 26 y Bun 1.4.4, incluidos los cinco CJS y
  los caminos ESM/CJS de Drizzle; resolver primero cualquier constructor CJS.
- Revisar `infer: false`: fechas fuera de UTC, parámetros ambiguos y precisión
  CAS en `tests/multi-tenant-ab/fiscal/postgresAdapter.ts`. El contrato sólo
  verifica el Date previo al envío, no su representación en el protocolo.
- No se encontraron llamadas `sql.array` en los consumidores revisados;
  sí arrays con cast `::uuid[]` en `localLockCoordinator.ts` y
  `scripts/tests/fiscal/recurring-full-schema.mjs`. Comprobar vacíos/nulls y
  tipos con la nueva versión. No añadir `infer: true` global para ocultar diferencias.
- Verificar errores/SQLSTATE, transacciones anidadas y rollback efectivo,
  reservas y uso tras `release`, fallos de conexión y cleanup con `end`.
- Validar las herramientas de CI y restauración en entornos temporales
  autorizados, conservando todos los gates y el opt-in de RLS/A-B.

Son cambios de comportamiento descritos por la
[release oficial](https://github.com/porsager/postgres/releases/tag/v4.0.0),
no incompatibilidades ya probadas con un servidor. Postgres es una dependencia
de desarrollo empleada por herramientas y pruebas; no se hallaron imports
literales en producción `src`/Edge. Los consumidores revisados usan `max: 1`:
el scheduler nuevo no acredita una mejora de rapidez en la UI.
