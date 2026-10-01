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
| `/?workspace=organization` | Entrada explícita al ERP de la empresa del usuario |

El operador confirmado entra al Centro desde `/`. Los demás usuarios conservan
su entrada empresarial o de clientes. Los enlaces anteriores a
`/settings/organizations` y `/settings/catalogs` redirigen al Centro para
operadores; las cuentas sin autoridad global conservan la restricción existente.

## Autorización

- Ser `admin` de una empresa no concede permisos globales.
- `requirePlatformOperator` consulta `is_platform_operator()` con el cliente
  autenticado antes de cargar el cliente privilegiado. El RPC valida la fila
  explícita de `platform_operators` y `profiles.is_active`; no depende de una
  membresía o empresa activa.
- Cada RPC privilegiado vuelve a comprobar al actor con
  `assert_platform_operator(p_actor)`. Se mantienen ACL, límites de uso y
  alta durable. La UI no es una barrera de seguridad.
- El ERP y el portal siguen usando sus guards de rol y empresa. El enlace
  «ERP de mi empresa» no permite seleccionar otra empresa ni suplantar usuarios.
- La protección SQL que impide suspender la empresa del propio operador se
  conserva. No se crean operadores ni se conceden permisos en esta etapa.

## Caché y sesiones

Las rutas `/platform` no montan `OrganizationProvider` ni persistencia de datos
empresariales. Usan un `QueryClient` en memoria separado por usuario. Cambiar
cuenta o cerrar sesión desmonta sus formularios, cancela consultas y limpia el
cliente anterior; las respuestas tardías no se incorporan a la nueva sesión.
Al entrar se purgan las cachés empresariales persistidas. No se persisten los
resultados de plataforma. Al volver al ERP se verifica nuevamente la identidad
empresarial antes de restaurar su caché.

El estado del operador se revalida al enfocar y periódicamente (60 segundos).
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

## Siguientes etapas

1. Administración de operadores con permisos específicos, MFA y recuperación
   segura. Actualmente sólo existe la autoridad explícita global.
2. Estado de integraciones y fallos por empresa, sin exponer secretos.
3. Métricas del ecosistema con filtros territoriales, monedas comparables y
   exclusión identificable de datos de prueba en métricas comerciales.
4. Opcionales: suscripciones, subdominio propio y sesiones de soporte con
   autorización, duración y auditoría. No se implementa suplantación automática.

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
