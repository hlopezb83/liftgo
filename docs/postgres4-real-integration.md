# Postgres.js 4: integración local real

Fecha: 2026-10-30. Estado al cierre local: **candidato probado; publicación/CI autorizados, sin merge ni despliegue**.
Base de pruebas iniciales: `28118a72b6ccc9ebb5341ae51b6d4b602b2d46dc`.
Conciliado para publicación con main `f8b4c3cde7342a628d13eeb1af29f97bc3ebb4cb`,
preservando íntegros los upgrades Seroval plugins/Knip/Wrangler de PR379.
Preparación aplicada: PR375 `4621f8d754720390f31c3b3ab4b7ac21299d6256`.
La [preparación anterior](postgres4-compat-preparation.md) es evidencia histórica:
sus pins 3.4.9 y resultados offline describen ese momento, no este candidato.

## Cambios posteriores a la preparación

- `package.json`: cliente `postgres` fijado exactamente en `4.0.0`.
- `bun.lock`: sólo cambian el pin del workspace y la entrada/integridad de postgres.
  Lock generado por Bun, no reconstruido manualmente; preserva íntegro el lote2/PR379 ya incorporado a main.
- El test offline conserva todas sus expectativas de comportamiento. Cambian
  exclusivamente las verificaciones del pin y su diagnóstico a 4.0.0.
- Nuevo guard AST para llamadas literales `require('postgres')`: exige la
  normalización inmediata con el helper compartido. Prueba casos negativos;
  no pretende detectar alias de `require` ni imports calculados.
- Ambos contratos se agregan a `test:dependencies`. El filtro CI cubre las
  cuatro raíces escaneadas; un test verifica esa conexión para evitar que una
  futura adición CJS eluda el gate sin cambiar package/lock.
- Sin cambios de SQL del ERP, opciones de clientes, políticas, skip global,
  opt-in de RLS/A-B, migraciones remotas ni despliegues.

## Entorno y procedencia

Linux x64; Node **26.13.0**, Bun **1.4.4**, Drizzle ORM **0.45.4**,
Drizzle Kit **0.31.11**, PostgreSQL **17.11 Debian 17.11-0+deb13u1**.
Postgres.js4 oficial publicado `2026-10-29T18:02:56.730Z`: más de 24h
antes de instalarlo. Integridad npm comprobada; guard de edad no modificado.
`bun install --frozen-lockfile --ignore-scripts` pasa, incluida segunda
verificación. Se omitieron lifecycle scripts deliberadamente; esto no es
una certificación de instalación/despliegue completo con todos ellos.

Todos los servidores pertenecen a fixtures locales efímeros, sólo loopback
y sockets Unix desactivados. No hubo conexiones a Supabase ni bases remotas,
credenciales reales, datos operativos o accesos añadidos a servicios externos.
Los launchers existentes crean tablas/auth/roles sintéticos en clusters propios;
no equivalen al esquema/auth completos. Todos los clusters quedaron detenidos.
Se conservaron diagnósticos propios; no se borró información ajena.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Offline + guard AST, Node26 y Bun test | 13/13 PASS por runtime |
| `test:dependencies`, Node26 desde Bun run | 34/34 PASS |
| Herramientas CI Drizzle | 97/97 PASS |
| Python CI DB / SQL suites | 35/35 y 5/5 PASS |
| Journal y tipos fiscales / typecheck general | PASS |
| Cinco consumidores CJS reales, Node26 y Bun | 10 ejecuciones PASS |
| VAT + correcciones operativas, Node26 y Bun | 4 ejecuciones PASS |
| Fiscal Vitest, launchers Node26 y Bun | 55/55 por lanzamiento |
| CLI real migrate, Node26 y Bun | PASS: aplicación, hash/ledger e idempotencia |
| CLI migración fallida, Node26 y Bun | PASS: exit1, SQLSTATE42883, rollback comprobado |
| Matriz protocolo/Drizzle, Node26 y Bun | 19 PASS / 2 FAIL conocidos por runtime |
| Replay ERP completo, RLS/A-B autenticado, PG16 CI | NOT_RUN |

Los launchers fiscales invocan Vitest: el runtime de cada worker no fue
instrumentado independientemente. La ejecución directa bajo Bun sí se
acredita con los siete consumidores y la matriz de protocolo.
Recurring:18 PASS; lifecycle:18 PASS; correcciones operativas:35 PASS,
en cada runtime. No se aceptaron SKIP como prueba.

La CLI real usa fixtures de migración ajenos al ERP. La prueba comprueba fila
con JSON/fecha de microsegundos, hash SHA256 y timestamp exactos del ledger,
segunda corrida sin duplicación y fallo de una segunda migración. Los logs
del servidor registran CREATE TABLE, error42883 y ROLLBACK; la tabla no existe
después y el ledger conserva únicamente la primera entrada. Exit1 se exige.

## Dos incompatibilidades conservadas explícitamente

1. `require('postgres')(options)` falla con v4 en Node y Bun. Los cinco
   consumidores propios usan el helper; se ejecutaron realmente y pasaron.
2. El constructor de conexión de Drizzle CJS falla al invocar la namespace
   como función. No se encontró esa ruta en consumidores propios.
   Drizzle Kit0.31.11 `bin.cjs:78949–78960` hace imports dinámicos ESM y
   `drizzle(client)` con cliente explícito: su ruta real pasó.

No se cambiaron estos FAIL a expectativas verdes. Cliente explícito CJS y
constructor ESM, consultas, fechas/CAS, arrays UUID, JSON, numeric/bigint,
errores, abortos, savepoints, bloqueo entre sesiones y cierre pasaron.
La discrepancia `[null]::uuid[]` de la baseline3.4.9 desaparece en4.0.0;
no es regresión del candidato. La matriz inicial v3 conserva su resultado
20 PASS/1 FAIL y el candidato 19 PASS/2 FAIL.

## Validación pendiente antes de merge

No hay Docker/Supabase disponibles. No se sustituyó autenticación real por
stubs para acreditar RLS. Ambos workflows requieren `workflow_dispatch`
con `run_supabase=true`; un check skipped en PR/push no los valida.

En el SHA publicado posteriormente, ejecutar:

1. CI general con Node26.13.0/Bun1.4.4 e instalación congelada.
2. `.github/workflows/rls-db-tests.yml` manual, `run_supabase=true`.
3. `.github/workflows/multi-tenant-ab.yml` manual, `run_supabase=true`.
4. Verificar sus etapas reales: preflight → prepare/start-guarded/verify
   → journal/test:ci-tools → replay prepare →
   `bunx drizzle-kit migrate --config=drizzle.ci.config.ts` → replay verify
   → check-cron-off → RLS/smoke/full-schema o Playwright A/B.
5. Confirmar artefactos, ausencia de SKIP en los gates autorizados, cleanup
   y pruebas con PostgreSQL16 del runner. Mantener sus controles sin cambios.

Este documento no autoriza ejecutar esos workflows, publicar el parche,
fusionar ni desplegar. La integración local no sustituye esos gates finales.

## Evidencia local

Directorio `liftgo-postgres4-integration-evidence`: manifiesto `versions.json`,
logs completos, fixtures/runner CLI, matriz de protocolo y patches separados.
`preparation-pr375.patch` conserva la preparación original; el parche adicional
de actualización se entrega separado del candidato completo contra main.
Los dos intentos iniciales de launcher offline Bun y journal sin PATH correcto
se conservan; se corrigió la invocación (`bun test` y PATH), no las aserciones.
