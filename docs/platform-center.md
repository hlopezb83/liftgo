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
  compensación del alta. La UI no es una barrera de seguridad.
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

## Siguientes etapas

1. Ampliar el alta con idempotencia persistida y reanudación de estados
   intermedios. La compensación existente no equivale a un trabajo durable.
   Importación revisada de maestros desde Org 1 con normalización y duplicados;
   no hay sincronización automática con Org 1.
2. Administración de operadores con permisos específicos, MFA y recuperación
   segura. Actualmente sólo existe la autoridad explícita global.
3. Estado de integraciones y fallos por empresa, sin exponer secretos.
4. Métricas del ecosistema con filtros territoriales, monedas comparables y
   exclusión identificable de datos de prueba en métricas comerciales.
5. Opcionales: suscripciones, subdominio propio y sesiones de soporte con
   autorización, duración y auditoría. No se implementa suplantación automática.
