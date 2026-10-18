# Contrato de ejecución del carril versionado de migraciones

Inspección estática del repositorio en `e51f16d71d4180671fa3c4147fc514da2f37ac34` y de sus paquetes instalados. Este documento no certifica acceso, ledger ni aplicación productivos. No se ejecutó conexión, consulta remota, migración ni modificación de permisos para prepararlo. Las referencias de código son relativas a la raíz del repositorio; los números de línea corresponden a la revisión inspeccionada.

## Mecanismo existente y acceso necesario

El carril nuevo es `drizzle/migrations/*.sql` más `drizzle/migrations/meta/_journal.json`. `docs/migrations.md:16–28` exige correspondencia de archivos, índices continuos, tags únicos y `when` estrictamente creciente; el verificador comprueba ese contrato local, sin tocar una base (`scripts/check-drizzle-journal.ts:40–95`).

En un **runner remoto oficial autorizado**, con checkout del SHA aprobado y con la URL de migración inyectada por el gestor de secretos del entorno en `LOVABLE_DB_MIGRATION_URL`, el comando existente del repositorio es:

```bash
bun install --frozen-lockfile
bun run migrations:check
bunx drizzle-kit migrate --config=drizzle.config.ts
```

La instalación congelada es la que usa `.github/actions/setup-bun-project/action.yml:42–44`; allí Bun está fijado a `1.4.2` (`:5–8`). `drizzle.config.ts:3–8` selecciona PostgreSQL, `./drizzle/migrations` y esa variable de entorno. La URL se proporciona al proceso; no se coloca en argumentos, documentación, commits ni salida de diagnóstico.

El runner debe tener conectividad al destino aprobado y una identidad con permisos para el DDL del lote pendiente y para leer/escribir su ledger. Esto es un requisito de ejecución, no una solicitud de ampliar permisos ni una certificación del acceso actual. Identificar el canal oficial disponible, su inyección de secretos y su mecanismo de exclusión sigue siendo una validación operativa pendiente. Esta inspección no permite afirmar que falte acceso en Lovable Cloud ni determina qué DDL admite una herramienta de consulta existente.

Las invocaciones comprobadas del comando en el repositorio son de **CI efímera**: `.github/workflows/rls-db-tests.yml:71–73,175–180` y `.github/workflows/multi-tenant-ab.yml:134–139,186–191`. No constituyen por sí mismas un runner productivo. `docs/migrations.md:44–57` exige canal oficial y ledger fresco antes/después; no identifica ni implementa ese canal.

## Versiones y ruta real inspeccionadas

| Componente | Versión exacta | Evidencia |
| --- | --- | --- |
| drizzle-kit | `0.31.11` | `bun.lock:1235`; `node_modules/drizzle-kit/package.json:3` |
| drizzle-orm | `0.45.3` | `bun.lock:1237`; `node_modules/drizzle-orm/package.json:3` |
| postgres | `3.4.9` | `bun.lock:1725`; `node_modules/postgres/package.json:3` |

La CLI `node_modules/drizzle-kit/bin.cjs:92019–92062` carga la configuración y llama al migrador con carpeta/schema/tabla. Sin driver explícito, intenta primero `pg` (`:78876–78903`), después `postgres` (`:78945–78963`). En la instalación inspeccionada `pg` no resuelve y `postgres` sí: el camino es `drizzle-orm/postgres-js/migrator.js:1–4`, con cliente `max:1`. Es una observación de este árbol instalado; otro runner debe confirmar su resolución de dependencias. Las importaciones dinámicas usan los módulos ESM `.js`.

## Garantías reales y límites

| Aspecto | Contrato observado |
| --- | --- |
| Lectura de archivos | `node_modules/drizzle-orm/migrator.js:3–29` recorre `journal.entries` en su orden, carga cada `tag.sql`, divide por `--> statement-breakpoint`, usa `when` como `folderMillis` y calcula SHA256 del contenido SQL leído. No ordena ni corrige el journal. |
| Bootstrap | `node_modules/drizzle-orm/pg-core/dialect.js:44–55` usa por defecto `drizzle.__drizzle_migrations` y crea schema/tabla **fuera** de la transacción del lote. Ese bootstrap puede permanecer aunque el lote falle. |
| Ledger | La tabla creada tiene `id SERIAL PRIMARY KEY`, `hash text NOT NULL`, `created_at bigint` (`dialect.js:47–53`). No impone unicidad sobre hash ni timestamp. |
| Selección pendiente | Lee una sola última fila por `created_at DESC LIMIT 1`, **antes** del BEGIN (`dialect.js:56–59`). Ejecuta entradas con `when` mayor que esa última fecha (`:60–62`). **No compara el hash aplicado, no detecta un hueco antiguo y no relee el ledger bajo bloqueo.** |
| Transacción | `dialect.js:60–71` engloba **todo el lote pendiente** en una transacción, con cada sentencia SQL y su INSERT al ledger dentro. No es una transacción independiente por archivo. La garantía corresponde a ese camino y a sentencias compatibles con la transacción; requiere revisar el lote completo. |
| Commit y rollback | `node_modules/drizzle-orm/postgres-js/session.js:108–121` delega a `client.begin`. `node_modules/postgres/src/index.js:234–278` ejecuta BEGIN, revierte al error (`:267–272`) y confirma al éxito (`:275–278`); la reserva de conexión está en `:299–304`. |
| Exclusión | En el camino CLI → migrator → dialect → session → `postgres.begin` inspeccionado **no hay advisory lock, `FOR UPDATE` ni bloqueo explícito del ledger**. Los locks implícitos de PostgreSQL existen, pero no son un mutex de migraciones. `max:1` sólo limita ese cliente. |
| Reejecución | Tras un éxito y con un único ejecutor, un segundo recorrido omite fechas anteriores/iguales. Esto no demuestra igualdad de hashes ni “exactamente una vez” concurrente. Dos ejecutores pueden leer la misma última fecha e intentar el lote; la consecuencia concreta depende de su SQL. Esa carrera es una inferencia estática, no un ensayo productivo. |

La exclusión requerida debe cubrir **un solo ejecutor por base durante preflight, aplicación y verificación posterior**. El grupo GitHub `workflow + ref` de CI (`.github/workflows/rls-db-tests.yml:53–55`) no acredita esa exclusión productiva. El `InMemoryMutex` de Kit (`bin.cjs:15236,15859–15871`) protege la carga de configuración, no la ejecución de migraciones.

## Preflight y verificación posterior con SELECT fresco

1. Fijar el SHA revisado y el manifiesto de **todo** el journal: por entrada, `idx`, `tag`, `when` y SHA256 calculado con el mismo contenido/algoritmo de `node_modules/drizzle-orm/migrator.js:15–23`. Validar dependencias y permisos requeridos por todo el lote que quedaría pendiente. El comando aplica todas las entradas seleccionadas por timestamp; no selecciona solamente una migración de interés.
2. Desde el canal aprobado, confirmar el destino y consultar el ledger actual en sólo lectura. Primero comprobar su existencia; si existe, leer todas sus filas:

```sql
SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS ledger_exists;

-- Sólo cuando ledger_exists sea true:
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at, id;
```

3. Comparar cada registro aplicado con el manifiesto (`created_at` frente a `when`, y **hash completo**), no sólo el máximo timestamp ni `max(hash)`. Detectar duplicados, migraciones ausentes dentro del prefijo aplicado, hashes diferentes y registros desconocidos. Los saltos del `id` serial por sí solos no demuestran una migración ausente. Si el ledger falta, diverge o el orden no corresponde, resolverlo antes de activar; no asumir que una base existente es una instalación limpia. Derivar el lote pendiente esperado y comprobar que coincide con lo que seleccionaría Drizzle.
4. Mantener la exclusión de ejecutores y ejecutar el comando versionado anterior en el runner oficial con el mismo checkout y configuración verificados. Registrar éxito/error del proceso. No crear ni reparar filas del ledger manualmente: los INSERT de aplicación pertenecen al migrador y a la transacción de su lote.
5. Hacer **otro SELECT nuevo** del ledger, comparar de nuevo hashes/fechas y confirmar que sólo aparecieron las entradas esperadas. Verificar mediante SELECT los objetos y contratos afectados por la migración. Si hubo error, comprobar el estado real: el lote transaccional revierte, mientras el bootstrap puede persistir. Resolver una respuesta incierta de commit mediante lectura fresca antes de reintentar.
6. Registrar SHA, fecha, manifiesto esperado, resultado y verificación de objetos sin publicar URL, credenciales, identificadores internos del backend ni datos de negocio. La equivalencia del repositorio y el estado productivo se demuestra en ese momento, no con un ledger histórico de otro entorno.

## Extensión sugerida al README público

Se puede enlazar este contrato desde el README de la corrección como límite de activación: el SQL y el journal son revisables y reproducibles; la publicación requiere confirmar el runner oficial, el único ejecutor y la comparación fresca de hashes antes/después. No se modificó producto ni se ejecutó activación al documentarlo.
