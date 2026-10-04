# Centro de Plataforma LiftGo

## Etapa 1 — portal independiente

El Centro administra las empresas y los maestros compartidos del ecosistema.
Comparte repositorio, identidad y backend Lovable Cloud con el ERP, con su
propio layout y autorización. Se conserva la marca global LiftGo.

| Ruta | Función |
| --- | --- |
| `/platform/login` | Inicio de sesión público para operadores; recuperación usa el flujo existente |
| `/platform` | Inicio con conteos reales de empresas y accesos a administración |
| `/platform/organizations` | Empresas con búsqueda, filtros, paginación y alta con enlace gestionado |
| `/platform/organizations/$organizationId` | Ficha, checklist y cambio de acceso con motivo |
| `/platform/catalogs` | Modelos, SKUs y machotes legales globales existentes |
| `/platform/catalogs/import` | Revisión de nuevas incorporaciones desde Org 1 |
| `/platform/audit` | Bitácora global, filtros de empresa/ámbito y detalle de cambios |
| `/platform/operators` | Perfiles de cuentas internas validadas, motivo y confirmación de contraseña |
| `/platform/security` | Sesión propia y recuperación gestionada |
| `/platform/integrations` | Configuración, comprobación explícita de Facturapi y conteos de cola fiscal |
| `/platform/fiscal-jobs` | Trabajos fiscales por empresa, documento y operación; historial técnico |
| `/platform/monitoring` | Indicadores operativos y fuentes con fecha de consulta |
| `/platform/support` | Casos compartidos por empresa, responsables, severidad y seguimiento |
| `/?workspace=organization` | Entrada explícita al ERP de la empresa del usuario |

El operador confirmado entra al Centro desde `/`. Los demás usuarios conservan
su entrada empresarial o de clientes. Los enlaces anteriores a
`/settings/organizations` y `/settings/catalogs` redirigen al Centro para
operadores; las cuentas sin autoridad global conservan la restricción existente.

## Autorización

- Ser `admin` de una empresa no concede permisos globales.
- `requirePlatformOperator` consulta `has_platform_capability(acción)` con el cliente
  autenticado antes de cargar el cliente privilegiado. El RPC valida la fila
  explícita de `platform_operators` y `profiles.is_active`; no depende de una
  membresía o empresa activa.
- Cada RPC privilegiado vuelve a comprobar al actor con
  `assert_platform_capability(p_actor, acción)`. Los caminos legacy no
  clasificados exigen raíz. Se mantienen ACL, límites de uso y
  alta durable. La UI no es una barrera de seguridad.
- El ERP y el portal siguen usando sus guards de rol y empresa. El enlace
  «ERP de mi empresa» no permite seleccionar otra empresa ni suplantar usuarios.
- La protección SQL que impide suspender la empresa del propio operador se
  conserva. No se crean operadores ni se conceden permisos en esta etapa.

## Caché y sesiones

Las rutas `/platform` no montan `OrganizationProvider` ni persistencia de datos
empresariales. Usan un `QueryClient` en memoria separado por usuario y revisión de permisos. Cambiar
cuenta o cerrar sesión desmonta sus formularios, cancela consultas y limpia el
cliente anterior; las respuestas tardías no se incorporan a la nueva sesión.
Al entrar se purgan las cachés empresariales persistidas. No se persisten los
resultados de plataforma. Al volver al ERP se verifica nuevamente la identidad
empresarial antes de restaurar su caché.

El estado del operador se revalida al enfocar y periódicamente (30 segundos).
Una denegación o error de verificación oculta el contenido. Cada acción del
servidor verifica la autorización actual incluso entre esas revalidaciones.
La carga prolongada muestra reintento después de ocho segundos.

## Validación

Las pruebas offline cubren autorización estricta y carga tardía del cliente
privilegiado, revocación, errores, recuperación de contraseña, retorno interno
permitido, separación de proveedores, acceso sin rol empresarial y limpieza de
formularios/caché ante cambios de actor. CI verifica el árbol de rutas y el
arranque del bundle. Las pruebas SQL RLS y A/B usan bases efímeras.

La verificación visual publicada debe incluir: login sin sesión, denegación a
un administrador empresarial, entrada del operador, Inicio, Empresas,
Catálogos, navegación móvil y regreso al ERP. Registrar por separado cualquier
escenario sin sesión disponible; una prueba de componentes no acredita una
verificación visual publicada.

## Etapa 2 — fichas y trazabilidad administrativa

La ficha muestra identidad fiscal, administradores internos, adopción de modelos
y SKUs globales, versiones legales asignadas, contadores locales y cantidad de
cuentas bancarias activas. No devuelve llaves, saldos, números de cuenta, tarifas,
existencias, cuerpos legales ni permisos nuevos sobre el ERP de otra empresa.
La disponibilidad de Facturapi comprueba la llave del ambiente seleccionado
en el servidor; no consulta al proveedor. El checklist comprueba configuración,
no acredita validación SAT, timbrado, saldos o preparación para producción.
La comprobación explícita del proveedor se realiza en la pantalla Integraciones,
implementada con la migración `0093`; la ficha conserva su checklist de configuración.

Los contadores se muestran como texto, desde `0001`, sin truncar valores mayores
a cuatro dígitos ni consumir folios. Los contadores aún no creados se inicializan
al emitir el primer documento. Facturas y notas fiscales conservan el folio de
Facturapi. Una versión anterior de contrato puede seguir siendo válida.

La lista pagina veinte empresas en el cliente sobre la consulta existente. La
bitácora sí pagina en SQL con cursor por ID, veinticinco eventos por página. Un
filtro inválido no ejecuta una consulta ampliada y un fallo muestra reintento.
Cambiar filtros reinicia el cursor. El ID se conserva como texto para no perder
precisión de `bigint` en JavaScript.

### Migración 0088 y alcance de la bitácora

- `platform_audit_events` tiene RLS y FORCE RLS con una policy restrictiva que
  deniega todo acceso de clientes.
  Anon y authenticated tampoco tienen grants sobre tabla, secuencia o RPCs
  privilegiados. Las funciones de servidor y SQL vuelven a comprobar al operador
  explícito y su perfil activo.
- Triggers registran altas/cambios/bajas de empresas, modelos, SKUs,
  compatibilidades, definiciones/versiones legales, asignaciones de plataforma y
  operadores en la misma transacción que la mutación. Un rollback revierte ambas.
  Las asignaciones legales de un administrador empresarial permanecen en su
  ámbito; no se atribuyen automáticamente a plataforma.
- El actor se toma de la identidad autenticada o del contexto local de la RPC
  privilegiada, con comprobación vigente. Las columnas `updated_by` anteriores
  no sirven para atribuir una acción nueva. `request_id` identifica la transacción
  SQL; no es el requestId de un reporte HTTP.
- La proyección guarda sólo valores administrativos permitidos y nombres de
  campos modificados. El contenido legal y la metadata arbitraria se excluyen.
  Los snapshots no tienen FK para conservar el historial al borrar identidades.
- UPDATE, DELETE y TRUNCATE de eventos se rechazan por trigger. Esto no limita
  a quien administra infraestructura y puede modificar el esquema. No hay edición
  o borrado de eventos desde el Centro.
- Se recuperan únicamente eventos de empresa identificados como plataforma en
  la bitácora anterior, con sus fechas y actores. No se inventa historial de
  catálogos anterior a la migración.
- La suspensión/reactivación usa una RPC nueva con motivo de 5–500 caracteres,
  rechaza formatos reconocibles de llaves/tokens y conserva la prohibición de
  suspender la empresa del actor. Las llamadas idénticas no agregan eventos.
  La RPC anterior mantiene compatibilidad durante el despliegue con un motivo
  que identifica la integración anterior.

Aplicar 0088 por el canal oficial Lovable Cloud después de validar CI, consultar
el ledger actual y comprobar el hash de 0087. Registrar hash y fecha del journal
en la misma transacción. Verificar ACLs, tabla y RPCs antes de publicar la UI.
Git por sí solo no acredita que la migración esté aplicada o que la versión esté
publicada. Las pruebas SQL de esta etapa corren exclusivamente en la base efímera
de CI y revierten los fixtures.

## Alta durable (8.42.39 / 0089)

- El cliente conserva una UUID y el mismo formulario al reintentar. La base
  normaliza y reserva empresa inactiva, correo e identidad Auth en una transacción.
  La misma UUID con otro payload se rechaza; un nuevo intento con correo o slug
  reservado tampoco crea una segunda empresa.
- Auth recibe el UUID preasignado y metadata de aplicación del servidor. Al
  reanudar se consulta ese UUID y se comprueba correo, empresa y solicitud;
  nunca se adopta una cuenta sólo por correo ni se cambia su contraseña.
- La finalización bloquea la solicitud y comprueba otra vez la identidad en SQL.
  Vincula membresía, rol, perfil, activación y cierre en una transacción. El
  trigger impide activar un alta pendiente mediante la acción de reactivación.
- Un replay terminado no reactiva una empresa suspendida ni restaura un rol
  revocado. Una cuenta eliminada de un alta terminada requiere revisión, no
  se recrea automáticamente.
- Empresas muestra las altas pendientes con páginas de 20 y acción Reanudar.
  La solicitud permanece en BD aunque se cierre el navegador o falle Auth.
  Las empresas pendientes del flujo anterior no se importan automáticamente;
  requieren revisar sus recursos antes de incorporarlas al nuevo ledger.
- No se guardan contraseñas ni enlaces. Sólo el worker que finaliza el alta
  genera el enlace; los replays no lo regeneran ni invalidan. El enlace queda
  sólo en la sesión de UI; no se envía correo. Si falla su generación o
  se pierde la respuesta de una finalización ya confirmada, el administrador
  puede usar «Olvidé mi contraseña». Una solicitud terminada no aparece en la
  cola de pendientes.
- La tabla es infraestructura global con RLS/FORCE deny-all para clientes,
  sin grants de escritura directa a service_role. Los RPCs verifican al operador
  activo. La reserva y activación conservan actor y UUID en la bitácora global;
  no se persiste un historial de cada intento fallido en Auth.
- Conserva los RPCs SQL anteriores para compatibilidad; el servidor publicado
  usa exclusivamente el flujo durable y rechaza contraseñas manuales.

Despliegue: validar CI, RLS y A/B; aplicar 0089 con su hash y fecha del journal
por el canal oficial de Lovable Cloud, en una transacción; verificar ACLs, ledger
y estado previo de empresas. Publicar después el frontend/servidor. Las pruebas
con fixtures SQL se ejecutan sólo en la BD efímera de CI y terminan en ROLLBACK.

Referencia técnica del proveedor de Auth usado internamente por Cloud:
[createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
y [código oficial de Auth, adminUserCreate](https://github.com/supabase/auth/blob/master/internal/api/admin.go).

## Referencias de evolución

Esta lista recoge las etapas propuestas después de 0089. Las implementaciones
y el alcance final del cierre YAGNI se registran en los bloques posteriores;
las métricas comerciales agregadas, suscripciones y subdominios no son requisitos
de ese cierre.

1. Verificar la entrega real del correo de recuperación y los redirects en
   Cloud antes de habilitar invitaciones de nuevas cuentas. La administración
   de perfiles de cuentas existentes y verificadas, sesión propia y confirmación
   de contraseña se implementan en 8.42.46 / 0092. MFA queda fuera por decisión de producto.
2. Estado de integraciones y fallos por empresa, sin exponer secretos.
3. Métricas del ecosistema con filtros territoriales, monedas comparables y
   exclusión identificable de datos de prueba en métricas comerciales.
4. Opcionales: suscripciones, subdominio propio y sesiones de soporte con
   autorización, duración y auditoría. No se implementa suplantación automática.

## Soporte compartido (8.43.0 / 0094)

La bandeja global aprovecha `feedback_reports` como origen. No incorpora
automáticamente reportes existentes ni abre el ERP de otra empresa. Desde
«Mis reportes», un usuario interno activo puede revisar y compartir sólo un
reporte propio de su organización activa. Clientes y compañeros no pueden
compartir, consultar o retirar el caso del reportante.

- El alta de reportes asigna el folio en un trigger privado, después de resolver
  la empresa. El navegador no ejecuta el generador ni proporciona números o
  reportantes ajenos. El contador se revierte si falla el INSERT. Los reportes
  propios de clientes conservan su flujo empresarial y no acceden a soporte global.
- El formulario exige revisión explícita. Comparte título y diagnóstico editables,
  módulo, versión capturada y requestId opcional validado como UUID. No comparte
  `context_json`, URLs empresariales, DOM, userAgent ni notas administrativas.
- La captura original queda sin compartir inicialmente. Si el usuario la autoriza,
  SQL comprueba el prefijo de empresa y reportante. No copia archivos. El servidor
  entrega un enlace de 60 segundos sólo tras comprobar sesión propia y capacidad
  `support.read`, y vuelve a comprobar el permiso tras la firma. Un enlace ya
  entregado puede seguir siendo válido hasta terminar ese minuto.
- Raíz y Soporte tienen `support.read/manage`; Observador, Empresas, Catálogos y
  administradores empresariales no reciben esas capacidades. RPCs privilegiadas
  comprueban otra vez sesión, perfil activo y permisos en SQL. Las tablas privadas
  tienen RLS/FORCE deny-all; servicio sólo recibe SELECT directo.
- La bandeja pagina 25 casos y filtra empresa, estado, severidad y búsqueda por
  nombre, folio, módulo o título. El detalle pagina el historial de 50 eventos
  con cursor `bigint` conservado como texto. Asignación requiere un operador
  vigente con `support.manage`. Abrir un caso no llama a IA ni modifica datos.
- Estado, severidad, responsable y notas son propios de soporte. No cambian los
  puntos, estado ni contenido del reporte empresarial. El reportante ve el estado
  y responsable de soporte; las notas de seguimiento permanecen en el Centro.
- Un caso por reporte e incremento de revisión bajo locks impiden altas
  duplicadas y guardados que sobrescriban cambios ajenos. Los conflictos preservan
  el borrador del operador hasta que decide cargar el estado actual. Un cambio
  idéntico sin nota no añade eventos. Un reintento sin confirmar requiere consultar
  el estado actual; no se promete replay de payload distinto.
- Diagnóstico, requestId, referencia de captura y notas tienen retención de 90 días
  desde su último compartido. Las proyecciones los ocultan al vencer; una tarea
  diaria a las 03:17 (zona del scheduler) los redacta físicamente. Retirar el
  diagnóstico los redacta en la misma transacción. Recompartir no recupera notas
  vencidas. El reporte y archivo original conservan la retención empresarial.
- Se conserva el rastro administrativo del caso: empresa, folio, estados,
  severidades, responsables y fechas. El historial guarda nombres/identificadores
  del actor y responsable al escribir para que una baja no borre la atribución.

Rollout: validar CI, RLS y A/B sobre el SHA del PR; preflight de ledger/0093;
aplicar 0094 con hash y `when` del journal en una transacción por Lovable Cloud;
comprobar ACLs, capacidades y tarea de retención antes de publicar. La prueba
funcional real usa exclusivamente ELOGISTIX/Empresa Prueba. Verificar Chrome y
navegador interno, consentimiento, seguimiento, retiro y denegación empresarial.
No acreditar permisos o una captura firmada mediante inspección visual solamente.

Referencia del proveedor de Storage usado internamente por Cloud:
[enlaces firmados](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).

### Pulido y resultado incierto (8.43.3 / 0095)

Las solicitudes de soporte tienen una espera de 15 segundos y pasan la señal de
cancelación al transporte. Vencer la espera libera la UI; no demuestra que el
servidor haya revertido la escritura. Compartir, retirar o guardar no se repiten
automáticamente. Tras cualquier resultado no confirmado se exige una consulta
actual completada antes de volver a enviar. Un error de actualización conserva
el borrador, incluso cuando ya había datos cargados. Una revisión nueva exige
cargar explícitamente el estado vigente; el compartido requiere revisar otra
vez su consentimiento.

Un guardado de seguimiento confirmado actualiza primero el caso en la caché de
detalle, conserva la paginación y después actualiza las fuentes. Una revisión
propia más nueva no se presenta como un conflicto; una revisión ajena superior
sí bloquea el borrador anterior. Los selectores y la nota se bloquean mientras
el guardado está en curso.

0095 cambia sólo la proyección y la búsqueda de soporte: muestra la razón social
recortada de la misma empresa, con su nombre interno como alternativa. La
búsqueda reconoce ambos nombres y conserva el filtro empresarial. No cambia
filas, revisiones, notas, estados, retención, sesión, permisos ni folios. Nunca
devuelve otros campos fiscales de `company_settings`. CI comprueba identidad,
búsqueda, fallback y aislamiento con datos efímeros y ROLLBACK.

Los filtros comparten una fila de escritorio con búsqueda de mayor anchura;
tablet y móvil usan filas completas. Los conteos distinguen «1 caso» y «1 reporte».

Referencias del transporte:
[cancelación de consultas](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation),
[AbortSignal](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal) y
[reintentos del cliente](https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js).
Son APIs de las librerías internas de Lovable Cloud; no requieren otro backend.

## Historial fiscal (8.43.6 / 0098)

La bandeja pagina 25 trabajos por empresa, estado de cola y operación (timbrado
de factura o cancelación de factura, nota de crédito y complemento). Búsqueda
por nombre interno/razón social, folio o ID. El detalle pagina 50 transiciones
con cursor `bigint` como texto. Requiere `integrations.read` y sesión vigente
en servidor y SQL; no habilita al administrador empresarial ni concede nuevas
capacidades. Las tablas técnicas tienen RLS/FORCE deny-all y servicio sólo SELECT.

Los triggers registran estado, intentos, presupuesto, aplazamientos y próxima
ejecución en la misma transacción que la cola. Cambiar sólo `updated_at` no
genera un intento. Rollback revierte la transición y su evento. El historial es
inmutable; conserva identidad y eventos tras retirar un trabajo, también ante
TRUNCATE. No registra cuerpos, errores crudos, claves, RFC, URLs, importes ni
UUID de CFDI. Las referencias a documentos se resuelven por ID y empresa exactos.
El nombre puede actualizarse desde la misma razón social; el snapshot conserva
una alternativa si la empresa ya no existe.

Los trabajos anteriores reciben una instantánea del estado observado al aplicar
0098, con configuración histórica desconocida. No se inventan intentos ni se
atribuye su pasado al ambiente actual. Nuevos trabajos capturan el ambiente y la
huella de la configuración al encolar; la huella queda privada. Esa configuración
no acredita por sí sola el ambiente en que un CFDI fue emitido.

«Finalizado en cola» informa del consumidor, no confirma timbrado/cancelación.
Una cola vacía no prueba que todos los CFDI estén conciliados. ID de Facturapi
sin UUID conserva el camino de conciliación. Abrir el detalle no llama al
proveedor ni inicia operaciones fiscales. Este primer tramo construye el historial;
la reserva de acciones, conciliación por ID/external_id y reprogramación limitada
con actor/motivo/resultado durable siguen como el siguiente tramo del bloque.

Despliegue: validar CI, RLS y A/B del candidato exacto; aplicar 0098 con su hash
y `when` en transacción, verificar grants/triggers y publicar después. Las
pruebas de cola, documentos, historial, rollback y TRUNCATE sólo corren en
PostgreSQL efímero y cierran con ROLLBACK, nunca en Cloud productivo.

Referencias: [triggers transaccionales de PostgreSQL](https://www.postgresql.org/docs/current/trigger-definition.html)
y [Facturapi: solicitudes 202 pendientes](https://docs.facturapi.io/docs/guides/invoices/intermitencias/).

## Incorporación revisada (8.42.40 / 0090)

La semilla inicial de 0046 ya promovió modelos y machotes. El nuevo flujo
revisa incorporaciones posteriores, de una en una. La fuente se fija al aplicar
0090 a la primera organización creada; suspenderla no selecciona otra empresa.
No hay cambio de fuente desde la UI ni sincronización automática permanente.

- Lista paginada de 20, por modelos, refacciones o machotes de contrato/pagaré.
  Muestra nuevos, coincidencias, conflictos, origen incompleto y ya incorporados.
  Los modelos de E2E se excluyen. No se aceptan IDs de otra empresa de origen.
- Modelos: fabricante/modelo recortados y comparación sin distinguir mayúsculas;
  se copian sólo capacidad, altura y combustible. Refacciones: SKU recortado en
  mayúsculas, nombre/categoría y unidad inicial `pieza`, explicada en la revisión.
  Ninguna tarifa, costo, existencia, ubicación, alias o dato fiscal se promueve.
- La comparación legal normaliza campos opcionales y arreglos vacíos. Igual
  contenido vigente puede reutilizarse; igual nombre con otro contenido,
  múltiples coincidencias o maestro global inactivo requieren revisión manual.
  El límite de contenido revisable es 200 KB. No se ejecuta HTML del machote.
- Reutilizar registra equivalencia/procedencia sin editar el maestro existente.
  Crear añade el maestro global y su origen; un machote nuevo publica versión 1
  inmutable. No vincula filas locales, no asigna documentos a empresas y no
  modifica transacciones ni documentos emitidos. La adopción usa los flujos
  empresariales y de asignación legal existentes.
- La UI requiere aceptación y motivo de 5–500 caracteres. Una huella incluye
  el contenido de origen, la coincidencia global y su estado. Se comprueba de
  nuevo bajo locks antes de escribir; cambios intermedios devuelven conflicto.
  Los reintentos conservan UUID y payload. Sólo la misma solicitud ya completada
  devuelve el mismo recibo; otra solicitud sobre un origen incorporado no crea
  un segundo maestro ni vuelve a publicar una versión.
- Reserva de fuente y recibos globales usan RLS/FORCE deny-all para clientes;
  servicio sólo puede leerlos directamente. RPCs de servicio vuelven a verificar
  operador activo. Los helpers internos no son ejecutables por clientes/servicio.
  Recibos append-only registran actor, motivo, origen, destino y huellas;
  la bitácora correlaciona también creaciones y reutilizaciones sin guardar
  contenido legal ni información financiera.

Rollout: validar CI, RLS y A/B; preflight real de ledger/0089 y fuente;
aplicar 0090 por el canal oficial de Lovable Cloud con hash y `when` del journal;
verificar ACLs, fuente, lista/preview y que no se crearon maestros ni recibos;
publicar el SHA aprobado. Las mutaciones de prueba usan fixtures SQL efímeros
y terminan en ROLLBACK; una lista de origen sin nuevos registros no acredita
que se haya ejecutado una incorporación real por UI.

Los locks por solicitud, origen e identidad complementan índices únicos y locks
de fila; no prometen que un escritor externo participe del protocolo de locks.
Referencia: [bloqueos de PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).

## Permisos específicos y último raíz (8.42.41 / 0091)

| Perfil | Autoridad global |
| --- | --- |
| Raíz | Todas las acciones clasificadas, incluidas futuras altas de operadores |
| Gestión de empresas | Listar/ficha, alta reanudable, suspensión y reactivación |
| Catálogos y documentos | Modelos/SKUs, incorporaciones, publicación y asignación legal |
| Soporte | Resumen de empresas y consulta de modelos/SKUs, sin ficha privada |
| Observador | Resúmenes, modelos/SKUs, machotes y bitácora, sin mutaciones |

La matriz fija se define en SQL. El acceso propio devuelve perfil, revisión y
capacidades mediante un RPC autenticado; no acepta otro actor. Todas las
acciones privilegiadas vuelven a comprobar la capacidad en SQL. Las políticas
RLS de maestros también distinguen lectura/escritura y conservan la consulta
empresarial de datos compartidos activos. El servicio sólo lee directamente
las asignaciones; los cambios deben pasar por RPCs privilegiados.

El operador explícito existente conserva su autoridad raíz. La migración no
crea cuentas ni promueve administradores empresariales. La administración de
perfiles desde UI queda para el siguiente bloque, después de sesiones y
reautenticación; no se habilita todavía una pantalla de altas de operadores.

Un marcador serializa cambios de asignación, activación de perfiles y borrados
de identidad. Triggers protegen el último raíz activo en degradación, revocación,
desactivación y cascadas de Auth. Dos transacciones concurrentes no pueden
retirar ambos raíces; READ COMMITTED verifica después de esperar y REPEATABLE
READ falla por serialización ante un snapshot anterior. TRUNCATE se rechaza.
La revisión aumenta incluso tras revocar y volver a conceder acceso, evitando
reutilizar una caché anterior. Actor/revisión nueva desmonta formularios,
cancela consultas y vacía el cliente anterior. Las rutas y controles sin
permiso no se montan. Ninguna acción depende sólo de esa visibilidad.

Pruebas: denegación de capacidad antes del cliente privilegiado, perfil sin
ámbito, retiro de borradores/caché, matriz SQL real, escritura directa RLS,
perfiles inactivos y continuidad del raíz. CI agrega dos sesiones PostgreSQL
concurrentes en su BD local efímera; ese script rechaza URLs de Cloud. Los
fixtures antiguos incorporan un respaldo explícito para probar revocación sin
desactivar la protección. El rollout requiere CI/RLS/A-B verdes, preflight de
0090, aplicación de 0091 con hash/fecha del journal y publicación del SHA probado.

El seed A/B asigna su primer raíz por `psql` como dueño del PostgreSQL efímero
exacto `127.0.0.1:54322/postgres`, además de los guards de API local. Exige un
registro de operadores vacío. El teardown conserva el único raíz hasta destruir
la base; para repetir en local se recrea el backend. No concede escritura directa
de asignaciones al servicio ni añade un bootstrap accesible desde el ERP.

## Preflight del bloque de sesiones (2 de octubre de 2026)

Decisión de producto: uso interno con usuarios validados. Los controles se
dimensionan para ese contexto. Se priorizan aislamiento empresarial, permisos
actuales, continuidad del raíz y recuperación sencilla. La confirmación de
contraseña se reserva para administrar accesos y permisos de operadores; las
consultas y operaciones cotidianas mantienen su autorización habitual.
El bloque de sesiones no cambiará límites globales de Auth del ERP. MFA sigue
fuera de alcance. Invitaciones y recuperación reutilizan Auth gestionado.

Se comprobó en Lovable Cloud que existen `auth.sessions.id`, `user_id` y
`not_after`. Ni `authenticated` ni `service_role` tienen SELECT sobre esa tabla;
el dueño de las migraciones (`postgres`) sí tiene lectura y USAGE de `auth`.
No se conceden permisos de lectura de sesiones al navegador ni al servicio.
El siguiente bloque requiere una función SQL con búsqueda fija, autorización
propia y salida mínima; todavía no se ha desplegado esa comprobación.

Verificar la firma del JWT y la asignación vigente de operador son controles
distintos de verificar su sesión. Un token ya emitido puede seguir firmado
después del cierre de sesión. La documentación del proveedor recomienda
correlacionar su `session_id` con `auth.sessions` para las acciones sensibles.
La mera existencia de la fila no prueba los límites de inactividad o duración
configurados; el diseño debe considerar vencimiento y revocación de plataforma.
Referencia: [sesiones del proveedor Auth](https://supabase.com/docs/guides/auth/sessions).

La consulta de Lovable identificó las tablas y límites de permisos, pero su
afirmación de que `signOut({scope:"local"})` sólo borra datos del navegador es
incorrecta. Ese alcance revoca la sesión actual en Auth. En el código vigente,
`AuthContext` intenta primero el cierre global y recurre al alcance local si
hay una excepción; ambos pueden fallar ante un problema de red. No se acredita
revocación remota sólo porque la UI quite datos locales.
Referencia: [alcances de cierre de sesión](https://supabase.com/docs/guides/auth/signout).

La lista de redirects, remitente, entrega de correos e invitación por correo
no se pudieron acreditar con las herramientas de lectura disponibles. El alta
actual genera un enlace de recuperación; no equivale a enviar una invitación.
Antes de habilitar altas de operadores se requiere comprobar los redirects y
el recorrido real de invitación/recuperación. No se enviaron correos ni se
modificaron contraseñas o sesiones reales durante este preflight.

Una reautenticación por contraseña en servidor necesita un cliente Auth sin
persistencia y crea una sesión temporal: se verifica identidad y se cierra ese
token con alcance local, sin sustituir ni cerrar globalmente la sesión del
navegador. La implementación confirma la contraseña dentro de la misma
operación de cambio de acceso y comprueba otra vez la sesión y los permisos.
No crea tickets, tablas de autorizaciones temporales ni banderas del cliente.
MFA continúa fuera del alcance por decisión de producto.

## Operadores y sesión propia (8.42.46 / 0092)

`/platform/operators` requiere `operators.read`. Permite buscar operadores o
cuentas internas activas, verificadas y no bloqueadas; muestra perfil y permite
asignar, cambiar o retirar el acceso con `operators.manage`. No crea usuarios
Auth ni altera roles o membresías de empresas. Las asignaciones existentes de
cuentas no disponibles se muestran para permitir su revocación. El acceso
propio lo administra otro raíz, evitando una revocación accidental.

El servidor confirma la contraseña del actor con Auth, usando un cliente sin
persistencia; cierra sólo la sesión temporal con alcance local y rechaza si
falla ese cierre. Aplica cinco intentos por minuto por operador. Después vuelve
a verificar su sesión original y su capacidad. La contraseña se borra del
formulario al enviar, no entra en MutationCache, SQL, bitácora ni respuestas.
Referencias: [signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
y [signOut, alcance local](https://supabase.com/docs/reference/javascript/auth-signout).

SQL comprueba actor, sesión viva, permiso y revisión del destino; serializa los
cambios con la protección existente de 0091. Rechaza formularios obsoletos y
conserva al último raíz. Un guardado idéntico no cambia la revisión del destino
ni agrega eventos. El motivo se registra en la bitácora transaccional.

`get_platform_session` sólo devuelve la sesión propia obtenida de `auth.jwt()`.
No acepta otro usuario o identificador de sesión. Los helpers privados y las
RPC administrativas no son ejecutables desde el navegador; no se conceden
lecturas directas de `auth.sessions` a clientes ni al servicio.

`/platform/security` está disponible para todos los perfiles de plataforma.
Comprueba la sesión, muestra la cuenta y perfil, ofrece cierre de sesión y
solicitud de recuperación al correo propio. Reutiliza el flujo de recuperación
existente: sólo `PASSWORD_RECOVERY` confirmado para el mismo usuario permite
actualizar la contraseña; los enlaces inválidos o de otra cuenta no aprovechan
una sesión previa. [Referencia oficial de recuperación](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

La existencia de una sesión no acredita los límites opcionales de inactividad
del proveedor. Esta etapa no configura esos límites ni modifica el uso diario
del ERP. Las pruebas automatizadas no demuestran la entrega de correo; los
resultados de la comprobación real se registran a continuación.
La recepción de un correo real en `hlopezb@gmail.com` se confirmó el 3 de octubre
de 2026. El usuario reportó regreso a Inicio; la corrección de 8.43.16 solicita
`/platform/login?type=recovery` y conserva el formulario mientras se valida el
enlace. Tras publicar 8.43.16, el usuario confirmó que el correo nuevo abre
«Nueva contraseña»; el recorrido queda verificado.
El remitente genérico se acepta por decisión de producto hasta disponer de un
dominio LiftGo; no se activó el dominio de otra marca del workspace.

El despliegue aplica 0092 antes de publicar frontend/servidor. La migración no
agrega, revoca ni cambia operadores reales; sus fixtures sólo corren en CI efímero.
## Integraciones y monitoreo — migración 0093

`/platform/integrations` pagina 25 empresas en el servidor. Muestra ambiente,
disponibilidad de la llave seleccionada, última comprobación vigente y conteos
de trabajos fiscales pendientes/en procesamiento y agotados. No devuelve
llaves, huellas, identificadores fiscales, payloads ni mensajes crudos.

`integrations.read` permite leer; `integrations.check` permite la comprobación
explícita. Raíz y Soporte pueden comprobar; Observador puede leer.
`monitoring.read` corresponde a Raíz, Soporte y Observador. Los perfiles
Empresas y Catálogos mantienen sus permisos. La migración cambia la revisión
de los perfiles afectados para limpiar sus cachés al revalidar.

Las nuevas funciones exigen una sesión propia activa antes del cliente
privilegiado y de nuevo en SQL. Sólo `service_role` ejecuta las RPC. La tabla
privada `platform_integration_checks` registra solicitud, actor, empresa,
ambiente, resultado, tiempo y versión; no almacena la llave o el cuerpo fiscal.
La huella privada de la llave permite excluir resultados de una configuración
anterior. Los cambios de llave/ambiente durante una consulta invalidan el
resultado. También se vuelve a comprobar exclusividad de la llave al terminar.

La consulta del servidor usa una sola llamada GET a
[`/v2/organizations/me`](https://docs.facturapi.io/api-es/#tag/organizations),
documentada para SecretTestKey y SecretLiveKey, sin emitir documentos. Tiene
timeout de 8 segundos, no sigue redirecciones y no hace reintentos automáticos.
SQL reserva la solicitud antes de consultar; una solicitud repetida no devuelve
otra llave ni llama otra vez al proveedor. Un bloqueo por empresa limita a una
comprobación por minuto; hay además un límite de cinco por minuto y operador.
La consulta no usa llaves globales de entorno ni cambia folios Facturapi.
La redirección usa modo `manual`, compatible con workerd. Todo estado distinto
de 200, incluidos 3xx, se clasifica sin seguir `Location` ni reenviar la llave.
Los fallos de transporte registran sólo una clase de error de una lista cerrada,
sin mensaje, token, cabecera, URL variable o cuerpo fiscal.
El preflight rechaza prefijos de llave incompatibles con el ambiente seleccionado.
El resolver fiscal del ERP aplica el mismo control antes de devolver una llave
para timbrar, cancelar, descargar o conciliar: exige `sk_test_` o `sk_live_`
según el ambiente y un valor posterior al prefijo. Una llave incompatible o
de cuenta (`sk_user_`) devuelve `config_invalid_key_mode` / HTTP 400, sin
devolver secretos, consultar al proveedor ni activar fallback de entorno.
El fallback legado de una sola empresa también valida el ambiente. Los folios
fiscales siguen procediendo de Facturapi.
«Conexión comprobada» acredita una respuesta válida de ese instante, no RFC,
certificados, capacidad de timbrar ni disponibilidad permanente del proveedor.

`/platform/monitoring` e Inicio muestran altas sin completar, empresas activas
con configuración fiscal incompleta, cola fiscal y reportes abiertos. Los
conteos proceden de tablas existentes y muestran fecha de consulta. Incluyen
organizaciones de prueba porque son métricas operativas, no comerciales.
La latencia corresponde exclusivamente a las comprobaciones explícitas.
La versión anunciada procede del artefacto del despliegue; no acredita por sí
sola el SHA publicado. No se inventan datos de respaldos, restauraciones,
telemetría general, CI ni costos por empresa.

El historial y la recuperación fiscal con conciliación se implementan en
0098/0099. Las acciones conservan sus permisos específicos y comprobaciones
de estado; no existe un reintento fiscal ciego. El monitoreo general se consulta
en Cloud y Sentry mediante enlaces, sin duplicar sus consolas.

## Ficha de ciudad, territorio y clasificación (0100)

La ficha administrativa incluye ciudad, territorio, contacto (nombre, correo y
teléfono) y clasificación explícita: Sin clasificar, Real o Prueba. Las empresas
anteriores permanecen Sin clasificar hasta que un operador las revise; no se
deduce el tipo por nombre, UUID o llave fiscal. ELOGISTIX se debe marcar como
Prueba mediante esta ficha después del despliegue.

- Raíz y Gestión de empresas pueden editar con `organizations.configure`.
  El servidor y SQL comprueban el permiso y la sesión actual.
- La lista administrativa incluye empresas reales, de prueba, sin clasificar
  y suspendidas. Tiene filtro explícito por clasificación y búsqueda por ciudad
  o territorio. No es una métrica comercial agregada.
- El contacto sólo se entrega con `organizations.details`. Las proyecciones
  de lista y auditoría excluyen sus valores; el historial registra los nombres
  de los campos modificados, el motivo, el operador y la fecha.
- El guardado serializa por empresa y compara una revisión textual. Ante un
  conflicto conserva la captura y exige revisar los datos actuales antes de
  adoptar la revisión nueva. Un guardado idéntico con revisión vigente no crea
  otra revisión ni otro evento.
- La ficha no modifica nombre fiscal, RFC, llaves, bancos, costos, precios,
  inventario, contratos ni permisos de usuarios empresariales.

Despliegue: completar primero el bloque fiscal de 0099 (handlers, worker al
final, frontend compatible y activación pendiente de `integrations.retry`).
Después aplicar 0100 con su ledger, verificar ACL/RLS/RPC y publicar el frontend
de esta ficha. La migración conserva las capacidades canónicas de 0099; no se
debe usar para activar anticipadamente un reintento fiscal.

## Cierre YAGNI — 8.43.16 / migración 0101

- Los formularios de ficha, modelos, SKUs, operadores y adopción legal confirman
  el descarte de capturas. Soporte confirma el descarte al cerrar su panel y
  bloquea el cierre durante una operación. Se reutilizan los componentes existentes.
- La edición de modelos y SKUs compara `updated_at` dentro del bloqueo SQL;
  conserva microsegundos y avanza el token incluso en la misma transacción.
  Publicar un machote compara la UUID de su versión de partida. Un conflicto
  devuelve 409, conserva el borrador y exige consultar/aceptar explícitamente
  la base actual. Los clientes anteriores no sobrescriben maestros existentes.
- El historial legal permite leer autor, fecha, resumen, contenido y diferencias
  con `templates.read`. Publicar y adoptar siguen exigiendo sus propios permisos.
  La vista previa deja las variables sin resolver: no representa un contrato
  firmado ni incorpora datos de una empresa.
- Inicio enlaza altas pendientes, configuración fiscal y trabajos en cola o
  agotados. Distingue reportes empresariales de casos abiertos de plataforma;
  los estados y filtros corresponden a cada origen.
- Monitoreo enlaza el proyecto Cloud y Sentry. No se incorpora MFA, suplantación,
  planes SaaS ni un motor genérico de políticas.

Aplicar 0101 después de 0100, con hash y fecha del journal en una sola
transacción, y verificar ACL/RPC antes de publicar frontend/servidor. No modifica
filas existentes. Los fixtures de concurrencia y separación A/B se ejecutan
únicamente en la base efímera de GitHub Actions y terminan con ROLLBACK.

### Estado de validación — 3 de octubre de 2026

El PR #233 se fusionó con CI, 3635 pruebas, 115 suites RLS, 46 suites SQL y el
gate A/B aprobados. La 0101 quedó aplicada con su ledger en Cloud y se publicó
8.43.16. Se verificaron permisos, triggers y conteos sin cambios de maestros ni
versiones existentes. Se comprobaron Inicio, filtros, descarte de borradores y
historial/vista previa legal en escritorio y móvil desde el navegador interno.

El usuario confirmó que el correo nuevo solicitado desde 8.43.16 abre
«Nueva contraseña». Queda validado el recorrido de recuperación; no se cambiaron
credenciales desde la auditoría. El branding del correo se omite por decisión
de producto hasta disponer de un dominio LiftGo.

### Comprobaciones operativas

1. **Recuperación — verificada:** para repetir la prueba, solicitar un enlace
   nuevo en `/platform/security` o en
   `/platform/login`, abrirlo una sola vez y comprobar «Nueva contraseña».
   El usuario completa la contraseña; no se comparten enlaces ni credenciales.
   Un enlace inválido debe ofrecer solicitar otro, nunca usar una sesión previa.
   Cloud → Users → Auth settings → Advanced ya permite
   `https://liftgo.lovable.app/**`; no se amplía esa autorización.
2. **Restauración aislada — excluida por decisión de producto:** el 3 de octubre
   el usuario decidió omitir por completo el ensayo propio y dejar la operación
   de restauración a Lovable Cloud. No forma parte del plan YAGNI ni de sus
   criterios de cierre. No se ejecutó una restauración por esta auditoría.
   El workflow `restore-rehearsal-verify.yml` y su verificador siguen disponibles
   como herramientas opcionales; no se ejecutan para este cierre.

### Respaldos disponibles — comprobación de sólo lectura

El 3 de octubre se consultó Cloud → Database → Backups del proyecto LiftGo:
había 15 snapshots visibles, del 19 de septiembre al 3 de octubre. El más
reciente mostraba `2026-10-03 12:51:59 UTC`. No se ejecutó ninguna restauración.
La existencia de esos snapshots no acredita que se haya restaurado una copia.

Según la [documentación de Database](https://docs.lovable.dev/features/database#backup-and-restore),
Cloud conserva respaldos diarios de esquema y datos; los archivos de Storage
no forman parte de ellos. La [exportación del proyecto](https://docs.lovable.dev/features/advanced-settings#export-lovable-cloud-data)
tampoco incluye los archivos, el código de Edge Functions ni los secretos.
Se generó y descargó la exportación nativa de BD del 3 de octubre: 5,211,723
bytes en formato PostgreSQL custom (`PGDMP`), con CRC del ZIP comprobado.
También se guardaron 40 grupos ZIP de Storage que contienen 91 objetos distintos
del inventario de 658; se cotejaron rutas y tamaños y se comprobaron los ZIP.
Es una copia parcial. Los archivos privados y su inventario se conservaron
localmente, fuera de Git. La descarga masiva se detuvo y no es un requisito
para el cierre del portal.

La entrega de correo y la llegada al formulario acreditan el recorrido de
recuperación; el cambio de contraseña queda a cargo del usuario. Las copias
descargadas y CI no se presentan como evidencia de restauración. Con el ensayo
propio excluido por decisión de producto, el bloque YAGNI está terminado y
publicado en 8.43.16; no queda un destino aislado como dependencia del cierre.
