# Ensayo manual de infraestructura, separado del replay ERP

Este ensayo no inicia PostgreSQL, Supabase ni migraciones. No carga configuración
de aplicación, Vault, claves de producto ni datos del ERP. No puede aprobar el
gate de #360: toda evidencia debe declarar `trial_only` y
`replay_authorized: false`. Los tests unitarios son modelos, no mediciones reales.

## Entrada y publicación

Workflow: `.github/workflows/pr360-network-trial.yml`, nombre visible
`PR360 isolated network trial`. Sólo admite `workflow_dispatch`, con:

- `expected_sha`: el SHA completo del commit revisado y publicado.
- `authorization`: `local-network-only-v1`.

El SHA del evento que selecciona el workflow y el del checkout deben coincidir
con ese input. Se exige el repositorio previsto y un runner GitHub alojado. El
job dispone sólo de `contents: read`; checkout no persiste credenciales. No hay
PAT, AWS, IAM, OIDC, secrets de producto, nuevos registros o deploy.

Publicación prevista en `investigate/pr360-network-trial-manual-20261029`, sin PR
ni tag. La auditoría de triggers y sus límites están en
[pr360-trial-publication.md](pr360-trial-publication.md). Abrir una PR puede
arrancar CI general; no pertenece a este procedimiento. La disponibilidad en UI
del workflow nuevo sigue siendo una comprobación posterior: no autoriza cambiar
`main`, añadir un autorun ni usar dispatch HTTP alternativo.

## Recursos y operaciones acotadas

El supervisor queda en el namespace del host para conservar cancelación y subida
de artefactos. El harness exige contexto manual y autorización explícita antes de
crear recursos. Registra SHA/run/intento/job/nonce y propiedad privada del intento.
No lee configuración Docker de credenciales: usa un directorio vacío propio y el
socket fijo `unix:///var/run/docker.sock`.

La imagen de prueba se construye localmente desde un ELF x86_64 mínimo, estático,
sin intérprete ni libc, cuyo único comportamiento es esperar mediante `pause`.
Se importa un tar con ese único ejecutable. No hay imagen base descargada ni capas
de Supabase. Se registran hashes de fuente/binario e ID de imagen local y etiquetas
del intento. Esto no prueba identidad GHCR ni equivalencia con ECR.

Los contenedores inertes tienen entrypoint explícito, usuario numérico sin
privilegios, raíz de sólo lectura, límites y todas las capacidades eliminadas.
Se conectan sólo a una red `bridge --internal` nueva y propia. No se modifica el
daemon, su configuración global, reglas del host ni destinos de producción.

El único uso administrativo adicional es entrar en los namespaces propios y
aplicar una tabla nftables de salida específica de cada uno. Antes de cada
entrada se vinculan contenedor, PID, tiempo de inicio e inode del namespace. El
supervisor abre y conserva un descriptor del namespace verificado; `nsenter`
utiliza ese descriptor, evitando una reutilización de PID entre comprobación y
entrada. Nunca se admite el inode del namespace de red del host para las reglas.
Clientes y servidores de prueba bajan a UID/GID del runner; ser root en el
supervisor no debe transferirse a los clientes del ensayo.

Las operaciones previstas son, conceptualmente:

```text
compilar el ejecutable inerte desde la fuente fija del ensayo
docker image import <tar-local-propio>
docker network create --driver bridge --internal <nombre-propio>
docker create --entrypoint /inert --user 65534 --cap-drop ALL --read-only ...
docker start <id-propio>
nsenter --net=/proc/<supervisor>/fd/<namespace-fijado> -- nft ...
nsenter --net=/proc/<supervisor>/fd/<namespace-fijado> -- setpriv <uid/gid-runner> ...
unshare --net ... <fixture nativo sin base de datos>
```

No deben copiarse como una receta autónoma: el harness debe comprobar identidad,
arquitectura, rutas, propiedades, presupuesto y observaciones. Una plataforma no
modelada o una comprobación incompleta produce FAIL; no se busca otra ruta.

## DNS e IPv4/IPv6

Un filtro del bridge no basta para acreditar el resolver embebido de Docker. El
ensayo actúa dentro del namespace con dos cadenas OUTPUT: DROP de UDP/TCP 53 en
prioridad -300 y filtro por defecto DROP en -150, después de conntrack y antes de
DNAT. DNS se deniega antes de cualquier permiso; no se permite `127/8`, loopback
genérico ni un `established accept` global. El resto de IPv4/IPv6 queda denegado salvo las
direcciones y el puerto TCP 5432 usados por los servicios locales de prueba.

Antes del filtro, se consulta explícitamente `127.0.0.11` por UDP y TCP usando
únicamente un alias local existente del contenedor hermano. Deben comprobarse
respuesta e IP esperadas. No se consultan dominios públicos ni se usa el resolver
del sistema con search domains. Después se repiten las mismas consultas: deben
fallar y aumentar el contador de DROP por cada transporte. Los contadores
antes/después se guardan por prueba, no sólo como un total que pudiera ocultar un
transporte sin cobertura.

Señuelos locales adicionales acreditan IPv4 host/gateway, IPv6 con ruta positiva
observada y comunicación permitida entre contextos en TCP 5432. Un timeout o la
ausencia de ruta no acreditan por sí solos un bloqueo. El observador debe estar
vivo, el control positivo debe funcionar y las solicitudes negativas no deben
recibirse. Los clientes son procesos sin privilegios, para no introducir bypass
de sockets raw o administración de red.

Esta política demuestra, como máximo, **denegación completa de DNS en el ensayo**.
No demuestra que Supabase pueda funcionar con sus aliases bloqueados. La futura
compatibilidad de su bootstrap queda pendiente y no se infiere de un resultado
de infraestructura.

## Presupuesto, cancelación y evidencia

El job tiene un límite total de 15 minutos. La suma de los límites de steps es
14 minutos. El harness reserva un máximo de 240 segundos de trabajo y 90 segundos
de cleanup; existe además un step de cleanup de hasta 2 minutos dentro del límite
global. No se inicia trabajo nuevo al vencer su presupuesto.

Cleanup se instala antes del primer recurso. Ante error, señal o timeout se
terminan primero los workers introducidos por `nsenter`, que podrían mantener
vivo el namespace. Se detienen/eliminan después sólo contenedores, red e imagen
propios. El PID 1 inerte puede ignorar SIGTERM: se contempla eliminación forzada
por ID verificado. No se vacían políticas ajenas ni se restaura un dump global.

Una cancelación o pérdida del runner sin limpieza acreditada nunca produce PASS.
El step final comprueba evidencia actual y resultado de limpieza; el carácter
desechable del runner no sustituye esa prueba. Sólo se suben metadatos seguros:
no inspect completo, variables de entorno, cabeceras ni contenidos de producto.

El ensayo sólo podrá declarar éxito después de mediciones reales de todos sus
controles y cleanup. Su éxito seguirá sin resolver #360 ni autorizar replay ERP.
