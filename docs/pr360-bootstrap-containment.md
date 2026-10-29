# PR360: bootstrap separado y contención de pruebas

## Estado y límite de autorización

Este documento es una propuesta para revisar. El contrato y sus fixtures son
offline: no han iniciado PostgreSQL, ejecutado SQL del historial, creado redes o
namespaces, aplicado reglas, descargado imágenes ni acreditado contención real.
No hay launcher operativo ni integración nueva en el gate. Un fixture válido no
autoriza un replay y nunca sustituye evidencia de una ejecución real.

La base de trabajo es `6c9da61b37a0172e87599c1e8e3985681bba4674`. El gate,
productores, SQL histórico, ACL operativas y Gitleaks de esa base se conservan.
GHCR sigue pendiente de identidad independiente de **todas** las imágenes
necesarias; no se incorporan digests de ejemplo ni se acepta un host/tag como
prueba de equivalencia. La operación descrita abajo requiere confirmación antes
de aplicarse, incluso en un runner desechable.

## Mecanismo soportado por CLI 2.34.0

No se necesita un fork del CLI. Su función `applyMigrationFiles` retorna sin
cargar ni aplicar las migraciones del proyecto cuando
`db.migrations.enabled=false`. El seed tiene un control independiente. El comando
`supabase migration up --local` aplica las migraciones pendientes por separado.
Fuentes de la versión fijada:

- [Control de migraciones y seed](https://github.com/supabase/cli/blob/v2.34.0/internal/migration/apply/apply.go).
- [Flags locales de migration up](https://github.com/supabase/cli/blob/v2.34.0/cmd/migration.go).
- [Aplicación del historial pendiente](https://github.com/supabase/cli/blob/v2.34.0/internal/migration/up/up.go).
- [Selección de red en el constructor Docker común](https://github.com/supabase/cli/blob/v2.34.0/internal/utils/docker.go).

El bootstrap ejecuta inicialización SQL **del proveedor**, incluidos esquemas de
servicios. No debe llamarse «sin SQL». Su propiedad requerida es que todavía no
ha ejecutado ningún archivo del historial de este repositorio. Deshabilitar cron
después de un `start` ordinario no proporciona esa propiedad.

`db.settings` en esta versión es una estructura cerrada que no ofrece
`cron.launch_active_jobs`. No se inventa una variable de entorno para ese GUC ni
se usa `PGOPTIONS` de un cliente como configuración del scheduler del servidor.

## Fases de una futura ejecución real

1. **Preparar, con red de herramientas disponible y sin SQL del proyecto.**
   Verificar el checkout exacto y los guardas; instalar herramientas y dependencias
   congeladas; obtener imágenes mediante la operación de imágenes autorizada.
   Registrar CLI real, plataforma y referencias/digests/IDs verificados. Fallar si
   falta una imagen necesaria. No activar descargas como fallback durante el
   replay. Esta fase no certifica que el registro se haya recuperado.
2. **Reclamar un intento nuevo.** Crear un marcador privado con
   SHA/run/intento/job/nonce antes de los recursos. Registrar identidades reales y
   hora de creación; no aceptar recursos sólo por nombre. El harness actual
   rechaza redes preexistentes: una ampliación debe admitir exclusivamente la red
   creada por ese marcador, sin volver permisivo el inventario general.
3. **Cerrar egress antes de `start`.** Crear la red privada y los controles
   descritos abajo. Verificar los controles con fixtures de red y señuelos
   exclusivamente locales. Una cobertura no acreditada bloquea antes de iniciar
   el bootstrap; una red `--internal` por sí sola no se considera suficiente.
4. **Bootstrap limitado.** Transformar sólo el checkout temporal del runner para
   exigir `db.migrations.enabled=false` y `db.seed.enabled=false`; registrar el
   texto/configuración analizada y su vínculo con la fuente canónica. Ejecutar el
   CLI fijado con `--network-id` apuntando a la red propia y con las exclusiones de
   servicios existentes. Todos los contenedores auxiliares de inicialización
   deben quedar en esa misma red contenida, sin interfaces adicionales.
5. **Barrera anterior al historial.** Verificar identidad/propiedad de la DB y
   baseline del proveedor. Exigir ledger Supabase vacío, cero jobs cron y ausencia
   del conjunto de objetos de aplicación vinculado al historial. Si falta un
   objeto de catálogo esperado o la consulta no es interpretable, bloquear; no
   convertir ausencia de observación en cero.
6. **Apagar y comprobar cron del servidor temporal.** Sólo tras aprobar esta
   operación, el launcher ejecutaría `ALTER SYSTEM SET
   cron.launch_active_jobs = 'off'` y `SELECT pg_reload_conf()` en esa DB temporal.
   Antes del historial debe observar la fila real de `pg_settings`, valor `off`,
   contexto recargable, fuente efectiva del archivo propio y
   `pending_restart=false`. Un retorno exitoso del comando no basta. Si el GUC no
   existe en la imagen fijada, bloquear y revisar el diseño. Conservar egress
   cerrado como protección independiente aunque SQL privilegiado reactivase cron.
7. **Restaurar y liberar el replay explícito.** Restaurar exactamente el config
   canónico con el seed deshabilitado, comprobar su igualdad estructural y de
   bytes esperados, y sólo entonces permitir `supabase migration up --local`.
   No permitir `--linked`, URL arbitraria, repair, reset, push o deploy. Verificar
   todas las versiones/archivos/orden de Supabase, el replay Drizzle y su ledger,
   los tres contratos de catálogo, RLS y las regresiones ya obligatorias. Los
   recuentos 593/121 describen la base actual; los esperados futuros se derivan del
   SHA corriente, sin aceptarlos como constante que permita omitir archivos.
8. **Revalidar y destruir.** Comprobar que configuración, propiedad y contención
   siguen vigentes, y recoger catálogo/ledger antes de destruir. Parar primero
   todos los procesos y contenedores propios manteniendo la denegación de salida;
   retirar después redes/namespaces/reglas/señuelos propios. Verificar ausencia
   final y sellar evidencia sólo al terminar la limpieza.

Debe probarse que el bootstrap separado y `migration up --local` producen el
mismo baseline del proveedor y el mismo historial que el procedimiento vigente,
sin doble inicialización, seed, exclusiones nuevas ni alteración de archivos SQL.
No se afirma todavía esa equivalencia a partir de la fuente o de mocks.

## Operación de contención propuesta para confirmación

La primera operación a autorizar sería una **prueba de infraestructura local sin
SQL histórico**, en un runner GitHub alojado nuevo, con un máximo de 15 minutos y
cleanup con presupuesto separado de 2 minutos. No usa destinos remotos como
canarios. No crea roles, grants, credenciales, mirrors ni reglas operativas.

Los siguientes son comandos/fases esperados para esa implementación futura, no
una receta ya ejecutada ni un script listo para aplicar:

```text
docker network create --driver bridge --internal \
  --label <propiedad-del-intento> \
  --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 \
  <nombre-derivado-de-run-intento-nonce>
docker network inspect <id-propio>
sudo nft --check --file <reglas-temporales-derivadas-del-inventario>
sudo nft --file <reglas-temporales-derivadas-del-inventario>
supabase --network-id <nombre-propio-verificado> start -x <exclusiones-vigentes>
```

El launcher debe derivar y validar el ID, bridge e interfaces del inventario real,
en vez de aceptar nombres/interfaces/CIDR enviados como input libre. Antes de
usar `nft`, comprobar el backend real de Docker/netfilter y rechazar una plataforma
no modelada; no mezclar a ciegas reglas nftables e iptables. La tabla/cadenas y sus
handles llevan propiedad del intento. No se vacían reglas existentes, no se cambia
la política global y no se reinicia Docker.

El flag del CLI recibe el nombre propio precreado: su constructor intenta crear
la red por nombre y tolera el conflicto si ya existe. No se asume que pasar el
hexadecimal del ID preserve esa misma red. La inspección posterior debe comprobar
que nombre, ID, propiedades y pertenencia de cada contenedor siguen siendo los
reclamados por el intento; la compatibilidad real permanece pendiente.

La propuesta de filtro del runner tiene este alcance:

| Tráfico | Política que debe acreditarse |
| --- | --- |
| Bridge propio a exterior u otra red | Denegar en `FORWARD`, IPv4 e IPv6. |
| Bridge propio a host/gateway/proxies/metadatos | Denegar conexiones nuevas en `INPUT`; preservar sólo respuestas de conexiones SQL locales ya autorizadas. |
| Contenedor a contenedor propio | Permitir únicamente puertos necesarios comprobados de DB/servicio; no publicar permisos por pertenecer simplemente al mismo CIDR. |
| Host/cliente local a DB propia | Mantener el destino loopback fijo necesario; inspeccionar que el binding real no abra interfaces externas. |
| DNS | Ningún resolver/proxy debe sacar consultas fuera del ámbito permitido; esto necesita una comprobación específica, no un timeout genérico. |

La opción `--internal` no impide por sí sola todos los accesos al host. El DNS
embebido de Docker también necesita una decisión demostrada: puede intervenir un
resolver/proxy que no quede representado por un simple paquete encaminado desde
el bridge. **Mientras no se acredite ese recorrido y su denegación en el Docker
real del runner, el resultado es FAIL y no se libera el historial.** No se propone
resolverlo con un bloqueo global del runner que corte la conexión de control de
GitHub o con un proxy/daemon alternativo aceptado por una relajación del auditor.

Para PostgreSQL nativo y los clústeres auxiliares PG16, la opción mínima propuesta
es un namespace Linux de red nuevo, sin veth ni ruta al exterior y con sólo
loopback, manteniendo los sockets Unix privados actuales. El launcher y los
clientes SQL de cada prueba deben ejecutarse dentro del mismo namespace para
conservar `127.0.0.1`; los binarios y dependencias se preparan antes. El supervisor
externo conserva su red para cancelación y artefactos. La invocación esperada es
del tipo `unshare --net --fork --kill-child`, sujeta a verificar la versión real,
identidad sin privilegios del proceso DB y seguimiento de todos los descendientes.
No se afirma que iniciar sólo el servidor dentro del namespace sea suficiente.

No se inicia esta operación hasta revisar la implementación concreta de esas
reglas/namespaces y aprobar su alcance. Si no puede demostrarse con un mecanismo
pequeño soportado, se devuelve el bloqueo; no se construye una plataforma de red
general ni se sustituye el socket Docker local protegido.

## Pruebas reales propuestas: sólo señuelos locales

- **Control positivo del observador:** un cliente autorizado alcanza un servidor
  HTTP/DNS señuelo alojado en el mismo runner, fuera del ámbito permitido a la DB.
  El señuelo registra el nonce sintético esperado y ningún dato del producto.
- **Control negativo de egress:** desde cada contexto DB y auxiliar contenido,
  intentar ese mismo destino local prohibido debe fallar. El observador debe
  acreditar cero recepciones, y los contadores/reglas o rutas deben corroborar la
  causa. No basta que la solicitud tarde demasiado o que el servidor esté caído.
- **Tráfico permitido:** las conexiones SQL por socket/loopback y las conexiones
  indispensables de auxiliares funcionan dentro del ámbito autorizado.
- **DNS y otras rutas:** probar por separado IPv4, IPv6, acceso a host/gateway y
  DNS mediante infraestructura local controlada. Si un recorrido no puede
  probarse sin destino externo o sin introducir un proxy inseguro, queda pendiente
  y bloquea; no se inventa una prueba satisfactoria.
- **Scheduler:** un fixture desechable independiente, sin historial de producto,
  demuestra primero que un cron habilitado ejecuta una marca local observable;
  otro fixture equivalente con cron desactivado no ejecuta esa marca al cruzar la
  ventana prevista. Nunca habilitar cron en el replay del historial para hacer el
  control positivo.
- **Mutaciones que deben impedir liberar SQL:** omitir una regla, permitir otra
  interfaz/red, habilitar cron, omitir su fila real, alterar el config de bootstrap,
  presentar ledger no vacío, perder una prueba de observador o fallar cleanup.

Los fixtures unitarios offline sólo verifican que el consumidor rechaza reportes
con esas propiedades inválidas. No prueban que el kernel, Docker o pg_cron hayan
aplicado la política.

Comprobar guardas antes y después no demuestra continuidad entre observaciones.
Cron usa una configuración recargable: SQL privilegiado podría reactivarlo. La
implementación real debe acreditar el mantenimiento de la contención y rechazar
cualquier pérdida observada; la denegación independiente de egress debe seguir
protegiendo incluso ante esa reactivación. El modelo offline no demuestra esa
continuidad ni certifica SQL futuro arbitrario.

## Evidencia, cancelación y cleanup

La ampliación futura del gate debe exigir la misma identidad
SHA/run/intento/job/nonce, manifiestos de fuente y configuración de ambas fases,
identidades de imagen verificadas, red/namespace/reglas concretas, mediciones de
los señuelos y cronología `denegación -> bootstrap sin historial -> cron OFF ->
replay -> catálogo -> cleanup`. Una evidencia de otro intento o un booleano
aportado sin mediciones no constituye aprobación. Se mantienen todos los
productores y controles existentes; el consumidor no interpreta «no ejecutado» o
«indeterminado» como PASS.

Un supervisor local debe instalar cleanup antes de crear el primer recurso y
seguir procesos/IDs propios. Ante error, señal, timeout o cancelación: impedir
liberar replay; mantener salida bloqueada; terminar procesos/contenedores y sus
descendientes; retirar después recursos de contención propios por identidad;
comprobar ausencia final. Si no puede demostrar ownership, no destruye recursos
ajenos y reporta FAIL. Si el runner desaparece antes del reporte final, su carácter
efímero no equivale a cleanup acreditado: la corrida no puede obtener PASS.

La retirada de reglas debe eliminar únicamente handles/tablas reclamados por el
intento; no restaurar un volcado global que pueda sobrescribir cambios del daemon.
Los artefactos se suben desde el supervisor del runner, fuera del ámbito DB, sin
reabrir salida a una DB viva. No adjuntar logs de contenedores, inspect completo,
cabeceras de autenticación o contenido de Vault; guardar sólo metadatos seguros.

## Permiso mínimo pendiente y decisión de mantenimiento

La aprobación concreta solicitada antes de una prueba real debe cubrir: runner
efímero seleccionado; red interna propia; reglas temporales limitadas a su
bridge/tráfico; namespaces de procesos DB y clientes; señuelos locales;
configuración cron de la DB temporal; duración y limpieza anteriores. No cubre
producción, Asus, nuevos secretos, AWS/IAM/OIDC, SQL histórico ni publicación.

La alternativa recomendada es reutilizar el catálogo/negativos/gate de #360 y
separar el bootstrap con opciones oficiales. Un reemplazo por linter acotado más
replay seguiría necesitando estas mismas garantías. Una reducción futura de la
estructura de jobs debe presentarse como cambio separado y conservar cada
productor/control; no es autorización para retirar el gate actual.
