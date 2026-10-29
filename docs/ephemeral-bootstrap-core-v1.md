# Core de bootstrap efímero: interfaz v1 y estado real

Esta rama implementa preparación de archivos, ownership de un solo uso y una
primitiva real de ejecución en un namespace ya creado. Los
contratos por fase son fixtures: siguen devolviendo `BLOCKED`,
`real_execution:false` y `replay_authorized:false`. No se ejecutaron Docker,
PostgreSQL, SQL histórico, namespaces ni reglas de red al desarrollar o probar
este cambio. No hay integración con el gate ni con workflows RLS/A-B.

Tampoco se integra aún `patch_legacy_migrations.py` ni la ejecución de las suites
posteriores RLS/A-B. Los workflows existentes permanecen intactos. La integración
debe conservar el parche legacy conocido en una copia temporal, su manifiesto
transformado y el hash del patcher, junto a las fuentes originales. Las guardas
actuales exigen fuentes prístinas: aplicar el patcher al checkout antes de este
core daría FAIL, nunca una tolerancia implícita de cambios históricos.

El arranque completo bajo contención previa **no está implementado**: el CLI 2.34.0 no ofrece un hook
que permita aplicar guardas a todos sus futuros contenedores antes de arrancarlos.
El ensayo real del SHA `3de0f1ce…` sólo acreditó guardas sobre procesos inertes ya
creados. Ningún resultado guardado de ese ensayo es una capacidad para este core.

## Interfaz común

```text
node scripts/ci-ephemeral-bootstrap.mjs prepare --profile PROFILE --expected-sha SHA
node scripts/ci-ephemeral-bootstrap.mjs start-safe --profile PROFILE --expected-sha SHA
node scripts/ci-ephemeral-bootstrap.mjs replay --profile PROFILE --expected-sha SHA
node scripts/ci-ephemeral-bootstrap.mjs cleanup --profile PROFILE --expected-sha SHA
```

`PROFILE` es exclusivamente `catalog`, `rls` o `ab`. La CLI exige contexto GitHub
hosted Linux/X64, repo exacto, SHA real de evento/checkout/input, fuentes limpias
y `PR360_BOOTSTRAP_NONCE` UUID v4 generado por el workflow de ese mismo intento.
No permite una URL de DB, red arbitraria, Docker host, ruta de estado ni comando
adicional por argumentos.

Binding común, con nombres exactos:

```js
{ sha, runId, attempt, job, profile, nonce }
```

Los exports del entry son `prepareBootstrap(options)`,
`startSafeBootstrap(options)`, `replayBootstrap(options)`,
`cleanupBootstrap(options)` y `BootstrapBlocked`. `options` contiene
`{binding, workspace, runnerTemp}`. Las funciones de preparación no certifican
contexto remoto: la CLI valida ese contexto y los fixtures programáticos sólo
prueban operaciones locales de archivos, sin capacidad de ejecutar un runtime.

| Operación | Comportamiento implementado |
| --- | --- |
| `prepare` | Lee fuentes; calcula manifiestos; crea carpeta 0700 y archivos 0600 exclusivos; conserva configs fuente/bootstrap/replay y ownership. Devuelve `PREPARED_RUNTIME_BLOCKED`. |
| `start-safe` | Revalida binding, ownership, archivos/configs y fuentes/journal actuales. Falla con `PRESTART_CONTAINMENT_UNIMPLEMENTED` antes de cualquier comando de runtime. |
| `replay` | Revalida las mismas propiedades y falla cerrado; no usa un JSON externo como autorización. |
| `cleanup` | Limpia únicamente la preparación, si está intacta y no declara recursos de runtime. Conserva tombstone privado para impedir reutilizar el binding. Devuelve `PREPARATION_CLEANED`, `runtime_cleanup:NOT_EXECUTED`; nunca PASS de limpieza DB. |

No existe un argumento para inyectar un backend o presentar `kind:real`.
`start-safe`/`replay` no son launchers funcionales en esta entrega parcial.

## Primitiva implementada del backend

`scripts/lib/owned-network-namespace.mjs` exporta
`pinOwnedNetworkNamespace(owner, options)`, `observeEmptyBoundary(pin)`,
`runInPinnedNamespace(pin, executable, args)` y `closePinnedNamespace(pin)`.
Sus defaults usan `fs`/`execFileSync` reales; las pruebas sólo usan ambos drivers
simulados juntos y no leen `/proc` ni ejecutan comandos reales.

El owner incluye el binding común, anchor `{pid,startTicks,namespaceInode}` y
`hostNamespaceInode`. Se comprueban `/proc` y el nonce exacto del anchor antes y
después de abrir el FD. Se exige nsfs mediante `statfsSync` sobre el path fijo del
FD, rodeado por `fstatSync`, pues Node no ofrece `fstatfsSync`. El token se crea
en un WeakSet privado: un JSON o una observación anterior no pueden sustituirlo.

El runner ejecuta sin shell mediante `nsenter --net=/proc/self/fd/3`, pasando
el FD por stdio y usando entorno reducido. Revalida identidad antes y después;
no reabre el namespace por PID en el hijo. Sólo el supervisor revisado debe
proporcionar argv: esta función privilegiada no es un sandbox para código ajeno.

La observación lee interfaces y rutas IPv4/IPv6 de todas las tablas y exige sólo
loopback. Devuelve `BOUNDARY_OBSERVED`, `runtime_authorized:false`. No acredita
guardas continuas, daemons futuros, DNS ni replay. El cierre revoca primero el
token; un fallo de cierre/identidad permanece fallido y nunca se convierte en
`CLOSED` al repetir la llamada.

Esta primitiva aún no crea el namespace, Docker, containerd o cgroups, no instala
firewall y no está conectada a `start-safe`/`replay`. Por tanto no resuelve por
sí sola la barrera prearranque que se describe al final de este documento.

## Perfiles y fuentes

`profilePolicy(profile)` conserva los servicios del carril existente:

- `catalog` y `rls`: PostgreSQL y Auth; no gateway/PostgREST/Storage permanente.
- `ab`: PostgreSQL, Auth, Kong, PostgREST y Storage. No se reduce al perfil RLS.
- Los tres perfiles conservan Supabase y Drizzle. RLS y A/B también ejecutan el
  replay canónico Drizzle después del historial Supabase; ambos carriles quedan
  ligados al mismo binding, aislamiento y evidencia. No se omiten migraciones
  por decidirlo en el adaptador.

Las imágenes auxiliares Realtime/Storage usadas durante inicialización siguen
siendo necesarias aunque esos servicios estén excluidos al final. Las cuatro
identidades GHCR conocidas no cubren todo A/B; faltan al menos Kong/PostgREST.
No se aceptan tags, hosts, metadatos de manifests ni la equivalencia con ECR como
prueba de capas locales, ejecución o baseline proveedor. No se hicieron pulls.

Cada perfil obtiene `drizzleReplayManifest` mediante el helper vigente
`canonicalReplayManifest(workspace)`. Ese lector conserva las 123 fuentes y las
dos exclusiones preexistentes para 121 entradas efectivas. El core no recibe una
lista nueva de exclusiones ni cambia el helper. Antes de cualquier arranque
futuro debe recalcularse desde las fuentes/journal originales: un JSON que
simplemente afirme tener el manifiesto no es aprobación.

## Configuración y significado de release

El parser acotado existente rechaza tablas/keys desconocidas. La preparación
deja `supabase/config.toml` original intacto y genera tres archivos privados:

- `source.toml`: bytes fuente exactos.
- `bootstrap.toml`: sólo project_id propio derivado del binding,
  `db.migrations.enabled=false` y `db.seed.enabled=false`.
- `replay.toml`: configuración canónica con ese mismo project_id temporal y
  seed false, restaurando el comportamiento canónico de migraciones.

`release` es una barrera interna anterior al historial. Requiere contención
fresca previa al bootstrap, baseline proveedor independiente exacto, ausencia
observada de historial/objetos de app/jobs y cron OFF efectivo. Entonces podría
materializarse exactamente `replay.toml`, comparar su digest de fase y permitir
sólo `supabase migration up --local`, seguido de prepare, migrate y verify del
replay Drizzle canónico bajo la misma contención. No significa levantarla.

No se amplía `expectedBaselineConfig`/`verifyBaselineFiles` del auditor publicado
para tolerar overrides generales. Su futura integración necesita un protocolo
explícito por fase y config, conservando fuente original y el hash exacto
esperado. La etapa de release de esta entrega sólo existe en los fixtures.

## Contrato de fases y baseline

La librería pura exporta `CORE_SCHEMA_VERSION`, `validateBinding`,
`profilePolicy`, `createCorePlan`, `buildBootstrapQueries` y
`assessFixtureTranscript`. La última sólo acepta `kind:fixture` y devuelve
siempre BLOCKED, incluso con todas las fases válidas.

`plan.commands` incluye `replay` (Supabase), `drizzlePrepare`, `drizzleMigrate` y
`drizzleVerify`. La fase `replay` exige el campo `commands` en ese orden exacto,
además de ambos ledgers y las fuentes completas. Omitir el journal o el
manifiesto Drizzle se rechaza para cualquier perfil. La definición provisional
que hacía RLS/A-B Supabase-only y el hash `680bca9a…` quedan retirados.

Secuencia exacta:

```text
containment -> bootstrap -> cron-off -> release -> replay -> final-guards -> cleanup
```

Cada fase lleva `phase`, `binding` y `at` monotónico. El contrato exige configs,
comandos y manifiestos exactos; identidad del contenedor/volumen/data directory;
controles positivos y negativos causales; snapshots del baseline proveedor;
cron OFF desde el archivo propio con `pending_restart=false`; ledger exacto;
guardas finales y limpieza completa. El inventario proveedor incluye extensiones,
roles, schemas, objetos, rutinas, triggers y policies. No admite “la primera
observación es el baseline” ni una consulta omitida presentada como lista vacía.

Las queries son descriptores sin ejecución. Resultados que incluyan cuerpos de
rutinas, configuraciones o Vault deben mantenerse privados y normalizarse a
digests seguros; no se imprimen ni se incluyen crudos en artefactos. La fuente de
cron debe quedar dentro del data directory propio, no en PGOPTIONS del cliente.
El descriptor de actividad cron sólo considera `starting`/`running`; no acredita
por sí solo ausencia histórica o todos los estados de una versión real. El
backend está bloqueado y deberá contrastar esa semántica en su validación real.

## Bloqueo técnico del backend

La alternativa mínima identificada en fuentes oficiales sería un Docker daemon
y un containerd propios dentro de un namespace exterior sin interfaces/rutas
externas, con socket, exec-root, data-root, cgroup parent y ownership propios. El
CLI y sus auxiliares heredarían ese ámbito antes de ejecutar SQL proveedor. El
supervisor y la subida de artefactos quedarían fuera.

No basta trasladar la receta del ensayo:

1. Docker omite `ProgramExternalConnectivity` en redes `--internal`; los puertos
   publicados/proxy necesarios para A/B se crean en ese camino. Activar
   userland-proxy no subsana la omisión.
2. Omitir `--containerd` puede reutilizar el socket del sistema. Se necesita
   containerd propio explícito; un mount/net namespace no privatiza cgroups.
3. Un bridge normal dentro del namespace exterior podría conservar los puertos,
   pero cambia el mecanismo acreditado. Docker califica múltiples daemons como
   experimental y no se ha identificado la versión real de Docker del runner.

Fuentes: [endpoint Moby](https://github.com/moby/moby/blob/v28.5.2/libnetwork/endpoint.go#L661),
[publicación bridge](https://github.com/moby/moby/blob/v28.5.2/libnetwork/drivers/bridge/bridge_linux.go#L1415),
[containerd del sistema](https://github.com/moby/moby/blob/v28.5.1/cmd/dockerd/daemon.go#L894),
[múltiples daemons](https://docs.docker.com/reference/cli/dockerd/#run-multiple-daemons).

La fuente de CLI 2.34 sí admite `DOCKER_HOST` hacia un socket propio:
[constructor](https://github.com/supabase/cli/blob/v2.34.0/internal/utils/docker.go#L36).
Eso acredita una interfaz, no el comportamiento completo del diseño alternativo.

Antes de convertir la alternativa en backend operativo se necesita decidir ese
alcance y probarla sin SQL: puertos completos A/B, DNS local/upstream bloqueado,
IPv4/IPv6/host, procesos auxiliares, propiedad y cleanup. No se implementó un
proxy Docker ni una plataforma genérica como sustituto. Esta limitación es
técnica; la autorización offline permite código, pero no demuestra el mecanismo.
