# Ensayo 2: preparación local, sin autorización de publicación o ejecución

Base exacta: `c905b931271b5507f045d609507e41326c572f75`. Este parche prepara
un workflow manual y su harness. No ejecuta aquí Docker, namespaces, Workers,
listeners, direcciones IP, cgroups, SQL ni configuración administrativa real.
La publicación de una rama fue rechazada por revisión automática por faltar
autorización específica; no se repite. Las dos vías soportadas de transferencia
Library a Asus fallaron; no se reintentan ni se sustituyen por otra ruta.

## Ejecución futura propuesta

Se reutiliza `.github/workflows/pr360-network-trial.yml`, nombre
`PR360 isolated network trial`, con SOLO `workflow_dispatch`. Job:
`private-docker-trial` / `Disposable private Docker infrastructure trial v2`.
Permisos `contents:read`; checkout y upload-artifact fijados a los SHA observados
en el ensayo 1, `persist-credentials:false`. No AWS, OIDC, PAT, secrets, servicios
PostgreSQL/Supabase ni workflows reutilizables. No usa imágenes ERP ni registro.

Inputs para una ejecución posterior específicamente autorizada:

- Ref: la rama manual aislada del ensayo 2, sin PR.
- `expected_sha`: SHA completo DEL COMMIT FINAL que contiene este workflow y
  harness; debe coincidir con `GITHUB_SHA` y checkout HEAD. El SHA de base c905
  y el del ensayo 1 3de0f1 no son inputs válidos para este parche.
- `authorization`: `private-docker-local-only-v2`; v1 se rechaza.
- Nonce: UUID nuevo generado por el workflow, no input reutilizable.

El perfil `ab` del binding sólo selecciona el contexto más amplio de esta
infraestructura inerte. No acredita RLS, A/B de producto ni sus servicios,
Worker/navegador, SQL, RPC o producción. No se adaptan esos workflows aquí.

Antes de lanzar, la UI debe demostrar que seleccionar la ref v2 ofrece la
autorización v2. El registro de main observado en el cache local sólo ofrecía
v1. No se presupone que la UI refresque ese esquema. Si no lo ofrece, se
reportará bloqueo; no se intentará dispatch HTTP/API ni se cambiará main para
evadirlo.

## Operaciones administrativas que ejecutaría

El job de 15 minutos usa runner GitHub hospedado desechable `ubuntu-24.04`.
Su paso privilegiado ejecuta `/usr/bin/node` con `sudo env -i`, pasando sólo
metadatos de contexto y autorización; no hereda token, proxy ni credenciales.
El supervisor mantiene capacidades/FDs en memoria y maneja SIGINT/SIGTERM.
Presupuesto interno: trabajo de hasta cuatro minutos y resultado/cleanup de
hasta seis; paso privilegiado ocho minutos, job total quince con verificaciones
y artefacto. Cada comando tiene timeout. Un hard kill puede impedir cleanup:
eso es FAIL/CANCELLED, nunca cleanup PASS ni permiso de replay.

1. Lectura de SHA/fuentes tracked sin modificar Git ni desactivar controles;
   lectura de herramientas ya instaladas y hashes/versiones. No instala ni
   descarga herramientas. Containerd distinto de 1.7, módulos requeridos ausentes,
   AppArmor no legible o perfil `docker-default` no preexistente bloquean.
2. Directorio root 0700 en `/tmp`, configs propias y tar de Python/stdlib/libs
   del runner. Ese tar genera una imagen inerte local mediante `docker import`;
   no implica procedencia de imágenes Supabase. No site-packages ni login/pull.
3. Dos direcciones temporales del HOST desechable, exclusivamente en loopback:
   `198.18.0.1/32` y `fd00:360::1/128`, con vida de 900 segundos como última
   protección, ausencia previa y add confirmado. Dirección preexistente o
   resultado incierto bloquean; no se borra una dirección de ownership incierto.
   Se verifican namespace, ifindex y atributos antes de eliminar sólo las propias.
4. Siete canarios locales: TCP IPv4/IPv6 y DNS TCP/UDP loopback/benchmark.
   Workers independientes y contadores Atomics continúan observando mientras
   el hilo principal espera llamadas síncronas. Positivos con nonce, barreras
   acotadas y cero recepciones inesperadas antes/después de cada grupo.
5. Namespace exterior inicialmente sólo loopback; pin FD e identidad kernel,
   `lo` UP; cgroup v2 propio con hijos y readback; namespace privado de mounts
   común a containerd/dockerd; `/run` y `/var/run` privados, D-Bus sin fallback,
   securityfs de sólo lectura y guardas de AppArmor/módulos descritas en el
   [backend offline](pr360-private-daemon-offline.md). No cambia sysctls o
   controladores del root global. No carga, descarga ni modifica módulos/perfiles.
6. Resolver fijo heredado `127.254.36.1` en `/etc/resolv.conf`, bind privado de
   sólo lectura ANTES de los daemons. Default bridge normal `172.30.36.0/24` y
   bridge de prueba `198.19.36.0/24`; no `--internal` ni uplink exterior.
   Docker/containerd tienen sockets/configs/roots/cgroup propios y peers
   verificados. No se contacta el daemon del host.
7. Dos contenedores inertes: UID/GID 65534, caps cero, no-new-privileges,
   filesystem read-only, memoria/pids limitados y `--pull never`. Positivos de
   alias DNS Docker, comunicación local y seis puertos publicados dentro de
   outer. Se comprueban ambos caminos DNS: heredado desde daemon, override
   desde sandbox. El header efectivo de Docker debe demostrar el camino antes
   de consultar el nombre nonce `.invalid`, cuyo upstream es sólo el canario.
   Hay 18 negativos, con IPv4/IPv6/DNS UDP/TCP y testigos fuera de outer.
   Lecturas kernel nuevas de links/addresses/rutas de todas las tablas impiden
   aceptar uplinks/default routes o dispositivos desconocidos.
8. Cleanup en el mismo supervisor: elimina sólo contenedores/red/imagen propios;
   pidfd TERM y cgroup.kill sólo propios; comprueba cgroups/mounts y procesos
   en outer, cierra anchor/FD; control final de canarios DESPUÉS de parar los
   productores, retira listeners y ambas direcciones, archivo payload y scope.
   Si algo queda incierto se conserva el diagnóstico y FAIL. No borrar scope
   bajo recursos pendientes. El step `always()` es únicamente verificador del
   recibo terminal: NO reconstruye capacidades desde JSON tras SIGKILL.

El artefacto es sólo JSON seguro bajo directorio root de `/tmp`: binding,
fuentes, herramientas, controles y cleanup. No logs crudos de daemons, memoria,
tokens, fuentes SQL ni inventarios operativos. SHA/run/intento/job/nonce,
freshness y los 18 controles son obligatorios; omitido/cancelado/fallido/antiguo
no puede aprobar. El hash del JSON detecta alteración accidental, no firma
contra un atacante con root: el productor es el workflow revisado del mismo SHA.

## Alcance de publicación futura y bloqueos

No se ha realizado ninguna escritura GitHub. La auditoría usa sólo c905, 3de y
`origin/main` local cacheado `b76204390fe38048e629030d2bdd45cc49b4eb98`;
no acredita el main remoto actual. Antes de pedir publicar se revalidarán TODOS
los triggers efectivos del SHA remoto. En esas versiones, push no-main sin PR
no inicia workflows; abrir PR con `scripts/tests/**` SÍ inicia RLS actual y
puede activar replay por la pila o por fallo del detector. Por eso el mínimo
propuesto es subir una rama manual SIN PR, sin merge, sin tocar main ni filtros.
Incluso eso requiere autorización específica posterior al rechazo recibido.

No se afirma denegación universal de `request_module` por el kernel; ocultar
modprobe de userland no basta. Tampoco se certifica código de aplicación
arbitrario, clientes nativos reales/NSS o seguridad de producción. El ensayo
propuesto debe aceptar explícitamente ese residual del kernel en una VM
desechable o permanecer bloqueado; no cambia seguridad global para resolverlo.
El PASS histórico del ensayo 1 y los mocks locales no sustituyen ejecutar este
SHA con sus nuevos recursos y demostrar cleanup terminal.
