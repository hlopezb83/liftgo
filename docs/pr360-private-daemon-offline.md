# Backend privado: código offline y propuesta de ensayo 2

Este cambio posterior a `baa7fa18db5484a8862976a7f4c4fe4e669a3cab` implementa
infraestructura, sin modificar el contrato estable, entry, workflows, SQL,
permisos operativos ni políticas. Sus pruebas sustituyen toda operación de
kernel, filesystem administrativo, Docker y procesos por drivers completos.
No se ha iniciado un namespace, daemon, contenedor ni consulta SQL real.

## Código implementado

`outer-network-session.mjs` tiene un backend real por defecto: crea un anchor
inerte con `unshare --net`, valida IPC/nonce, PID, PPID, startTicks e inode de
namespace, reutiliza el descriptor FD revisado, observa que sólo hay loopback,
levanta y verifica `lo`, y reobserva las rutas. El anchor tiene un máximo de
12 minutos y termina si pierde IPC. La limpieza pide salida por IPC; no mata
un PID reutilizable. Un timeout o cierre incierto permanece FAIL y conserva
la incertidumbre de recursos. Cerrar anchor/FD no prueba ausencia de otros
procesos ni todos los recursos del futuro ensayo.

`private-docker-backend.mjs` prepara directorios/configs/sockets y un cgroup v2
exclusivo, verifica herramientas root-owned por bytes y versiones, y ejecuta
containerd y dockerd dentro del pin. Ambos heredan UN namespace privado de
mounts. Antes de lanzarlos oculta `/run` y `/var/run` en ese namespace; así los
daemons no usan accidentalmente el D-Bus ni el socket Docker por defecto del
host. No cambia esos mounts en el supervisor. También controla el acceso
explícito de userland a modprobe dentro de esa vista privada; esto no acredita
denegación de autoload iniciado por el kernel.

La identidad requiere namespace de red común, mount namespace distinto del
supervisor y común a ambos daemons, cgroup propio, argv/startTicks, sockets
propios ligados mediante SO_PEERCRED al PID real y el DockerRootDir/daemon ID
esperados. No basta que un archivo tenga nombre de socket ni que Docker
responda. La limpieza usa pidfd para TERM y, si es necesario, `cgroup.kill`
únicamente en el subtree creado en exclusiva. Verifica ausencia de procesos,
estado populated, mounts visibles del supervisor y ownership antes de borrar.
Un fallo de cleanup no puede repararse cambiando un JSON o reintentando hasta
obtener verde.

`isolated-docker-session.mjs` compone esas funciones reales: prepara outer y
backend, arranca el backend sólo después de revalidar outer, liga las
observaciones al mismo binding/namespace y limpia en orden inverso. No cierra
el anchor si la limpieza del backend falló. Ningún módulo devuelve autorización
SQL, PASS de catálogo, aprobación del replay ni full cleanup del ensayo.

APIs nuevas de infraestructura, sin cambiar las APIs estables de bootstrap:

```js
await prepareIsolatedDockerSession({ binding, runnerTemp, toolchain }) // opaque cap
await startIsolatedDockerSession(cap) // infrastructure observation, SQL false
inspectIsolatedDockerSession(cap)
await cleanupIsolatedDockerSession(cap) // components only, full cleanup false
```

Los tres perfiles usan el binding original
`{sha,runId,attempt,job,profile,nonce}`. La infraestructura no elimina servicios
de A/B. El bridge es normal, dentro del namespace exterior sin uplink; no usa
`--internal`. Los puertos publicados existirían en el loopback de ese namespace,
al que también deberán entrar los clientes autorizados. Esto está escrito y
probado con mocks; todavía no se ha comprobado con Docker real.

El contrato estable conserva Supabase y Drizzle en catalog/RLS/A-B, el journal
completo y la partición canónica 123 fuentes = 121 seleccionadas + dos receipts
preexistentes. Este cambio no aplica ni transforma migraciones.

## Lo que permanece bloqueado

El entry estable sigue bloqueando `start-safe` y `replay`. Este backend no se
ha conectado a esa ruta para arrancar SQL proveedor ni histórico. Faltan:

1. Evidencia nueva de ensayo 2 del SHA real y versión/toolchain observada;
   no se reutiliza el PASS 40913723902 del ensayo 1.
2. Baseline proveedor independiente, capas/config/runtime de imágenes,
   inventario previo vacío, cron OFF efectivo y ambos ledgers reales.
3. Confinamiento de CLI y procesos nativos Worker/navegador. Entrar sólo en
   netns como root no restringe pathname Unix sockets, filesystem, capacidades
   ni `setns`. NSS `resolve` puede usar sockets de systemd del host. La máscara
   de `/run` de este backend cubre a sus daemons; NO cubre automáticamente a
   clientes lanzados con el helper net-only del supervisor. No ejecutar código
   de aplicación bajo esa suposición. La integración deberá unir una vista de
   mounts segura y UID/capabilities/no_new_privs adecuados antes de sus clientes.
4. Integración estrecha de copia privada/patcher legado, config canónica
   restaurada con seed false, baseline existente del auditor, suites y gate.
   No tolerancia general a config o fuentes modificadas.
5. Supervisor y evidencias del ensayo completo, incluyendo observadores,
   canarios, recursos de imagen y cleanup en cancelación. Las receipts de
   componentes no sustituyen estas mediciones.

Son límites de integración y validación concretos; ninguna fixture actúa como
evidencia de kernel, Docker, producción o RPC.

## Propuesta de operación para ensayo 2: NO ejecutar aún

Requiere aprobación específica para runner GitHub hospedado desechable Linux,
administración temporal, namespace de red exterior y namespace de mounts
privado, cgroups v2 propios y dos daemons privados. Máximo 15 minutos total:
12 minutos de anchor desde su creación, de los cuales los dos últimos se
reservan a limpieza; hasta tres minutos fuera de ese lease para preparación y
supervisión. El supervisor inicia cleanup a más tardar al minuto 10 del anchor.
Un timeout/cancelación no equivale a cleanup
verificado. No usar runner persistente, Asus, SQL, Supabase ni imágenes ERP.
No publicar ni preparar workflow en este cambio.

Fases propuestas, bajo SHA/run/intento/job/perfil/nonce exactos:

1. **Supervisor fuera del aislamiento.** Comprueba runner desechable y
   herramientas presentes, versiones y hashes aprobados, cgroup v2 y
   controladores ya disponibles. No habilita controladores en el root global,
   no cambia sysctls globales ni carga módulos. Registra inventario inicial de
   módulos/kernel y sockets/procesos/cgroups de propiedad. Si AppArmor está
   habilitado, exige el perfil `docker-default` ya existente; si falta o no
   puede leerse la precondición, FAIL antes del arranque. No cargar/alterar
   perfiles ni usar `security-opt=unconfined`. Prepara localmente
   el payload inerte de prueba y cualquier dependencia antes de aislar. No hay
   pull/login ni fallback a otro registro durante el ensayo. Los cuatro
   manifests GHCR observados no son insumo ni aprobación de este ensayo.
2. **Canarios locales independientes.** Inicia observadores con identidad
   positiva/nonce fuera del namespace objetivo; sólo listeners locales del
   runner o de un namespace canario propio. Para testear upstream DNS no
   loopback con testigo alcanzable desde el host, la propuesta necesita añadir
   temporalmente direcciones de benchmark `198.18.0.1/32` y `fd00:360::1/128`
   a loopback DEL RUNNER desechable, tras comprobar ausencia; se borran sólo
   por ownership propio. No son destinos remotos. Si se prefiere no permitir
   esas dos direcciones, esa variante del test queda pendiente: no se sustituye
   por consultas a Internet ni se declara cubierta.
3. **Outer vacío antes de daemons.** El comando es
   `/usr/bin/unshare --net -- <node-verificado> outer-network-session.mjs
   __bootstrap_anchor <nonce>`. IPC privado y lecturas kernel ligan identidad;
   se fija el FD. `ip -j link show` y rutas IPv4/IPv6 de TODAS las tablas deben
   mostrar sólo loopback. `ip link set dev lo up`, relectura positiva UP y
   reobservación. No hay veth ni interfaz que conecte outer al host/Internet.
4. **Filesystem/cgroups privados.** Directorio root 0700, paths ASCII y
   sockets cortos, fuera de `/run` y `/var/run`. Cgroup exclusivamente nuevo
   con hijos daemons/containers/native. Se habilitan cpu/memory/pids sólo en el
   subtree propio y se verifica readback; si el padre no los ofrece, FAIL.
   `unshare(CLONE_NEWNS)` seguido de `mount(/, MS_REC|MS_PRIVATE)` y máscaras
   tmpfs privadas de `/run`/`/var/run` preceden cualquier daemon. Verificar
   ausencia de sockets host D-Bus/default-Docker y no heredar proxy/contexto.
5. **Arranque privado.** containerd usa config-v2, root/state/socket privados
   y CRI deshabilitado. dockerd recibe `--containerd <socket-propio>`, namespaces
   propios, `--data-root`, `--exec-root`, `--pidfile`, `--host unix://<propio>`,
   `--cgroup-parent /<cgroup-propio>/containers`, cgroupfs, cgroupns private,
   `--userland-proxy=true`, iptables/ip6tables propios del namespace. Configs
   vacíos y cliente `--config` privado evitan heredar defaults. Revalidación
   de hashes, procesos, SO_PEERCRED, socket inodes, daemon ID y mount/netns.
6. **Pruebas inertes nuevas.** Importar el payload local sin pull en el daemon
   privado. Bridge normal, dos contenedores inertes y puertos publicados de
   ejemplo PostgreSQL/API/Storage; listeners locales sin SQL. Positivos:
   contenedor-a-contenedor y alias DNS Docker, cliente en outer a puertos
   publicados y respuesta con nonce; negativos: listeners vivos del host por
   loopback IPv4/IPv6, direcciones canario y host-gateway. Probar DNS UDP y TCP
   en la ruta upstream loopback del daemon y en la ruta upstream no loopback
   del sandbox con resolv.conf privado explícito. Supervisores externos deben
   seguir vivos y sus contadores de recepción permanecer iguales. Reobservar
   enlaces/rutas e identidad después de crear los bridges/veth propios.
   Gateway del bridge PRIVADO es local al outer y puede servir al producto;
   no se confunde con acceso al host del runner. No consultar dominios ni
   direcciones reales remotas. El tráfico de artefactos sigue en el supervisor.
7. **Fallos/cancelación y cleanup.** Inyectar errores antes/después de start,
   respuesta de launch perdida, PID/socket/cgroup cambiado, hash cambiado,
   timeout e intento de evidencia de otro binding. Un incumplimiento siempre
   FAIL. Parar contenedores y daemons propios, TERM por pidfd y fallback
   cgroup.kill sólo del subtree propio; verificar vacío/populated0, ausencia
   de mounts propagados y borrar directorios/cgroups propios. Salida IPC del
   anchor y cierre FD al final. Retirar canarios y las dos direcciones locales
   propias; inventario final y procesos observadores deben acreditar cleanup.
   Si falla la fase del daemon, conservar anchor/ownership hasta que el
   supervisor pueda reportar incertidumbre. Teardown del runner es la última
   contención, no evidencia PASS de limpieza.

La prueba estructural nueva no fabrica contadores DROP del ensayo 1: sin ruta
externa, el kernel puede rechazar antes de una regla OUTPUT. Exige medidas
actuales de topología, identidad y testigos externos locales. Debe conservar
positivos y negativos; no puede emitir la evidencia de egress del contrato v1
como si hubiera medido sus contadores. El gate productivo queda sin cambios.

## Riesgos administrativos y fuentes

Docker documenta multi-daemon como experimental. Hay que observar las versiones
exactas y fallar ante cualquier supuesto no demostrado. Red/mount namespaces
no son aislamiento del kernel. Bridge/netfilter/veth pueden causar autoload de
módulos por el kernel; ocultar modprobe de userland no lo prohíbe de forma
universal. No existe aquí mecanismo probado para denegar TODO autoload sin
cambiar configuración global del kernel. Si ese requisito es absoluto, ensayo
2 queda bloqueado hasta resolverlo; no activar `modules_disabled` ni modificar
seguridad global. En runner desechable, el coordinador debe decidir si acepta
el residual acotado y el inventario before/after. Un cambio observado invalida
el ensayo; no justifica tocar producción.

Fuentes primarias usadas en la revisión de diseño:

- Docker: <https://docs.docker.com/reference/cli/dockerd/#run-multiple-daemons>
- Moby DNS: <https://github.com/moby/moby/blob/v28.5.2/libnetwork/resolver.go#L465>
- Moby puertos/internal:
  <https://github.com/moby/moby/blob/v28.5.2/libnetwork/endpoint.go#L661>
- D-Bus/firewalld:
  <https://github.com/moby/moby/blob/v28.5.2/libnetwork/iptables/firewalld.go#L99>
- Bridge/modprobe: <https://github.com/moby/moby/blob/v28.5.2/libnetwork/drivers/bridge/bridge_linux.go#L805>
- NSS/systemd:
  <https://www.freedesktop.org/software/systemd/man/latest/nss-resolve.html#Description>
- Docker/AppArmor:
  <https://github.com/moby/moby/blob/v28.5.2/daemon/apparmor_default.go#L24>

La rama específica de br_netfilter citada exige `!EnableICC ||
!EnableUserlandProxy`; con proxy true e ICC default true no se infiere que esa
llamada ocurra. El residual general de kernel autoload no se presenta como
una carga de módulos demostrada en nuestro runner.
