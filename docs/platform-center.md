# Centro de Plataforma LiftGo

## Etapa 1 — portal independiente

El Centro administra las empresas y los maestros compartidos del ecosistema.
Comparte repositorio, identidad y backend Lovable Cloud con el ERP, con su
propio layout y autorización. Se conserva la marca global LiftGo.

| Ruta | Función |
| --- | --- |
| `/platform/login` | Inicio de sesión público para operadores; recuperación usa el flujo existente |
| `/platform` | Inicio con conteos reales de empresas y accesos a administración |
| `/platform/organizations` | Pantalla existente de alta, suspensión y reactivación de empresas |
| `/platform/catalogs` | Modelos, SKUs y machotes legales globales existentes |
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

## Siguientes etapas

1. Ficha de empresa, checklist de incorporación y bitácora global con actor,
   motivo y cambios. Las pantallas trasladadas conservan su alcance previo.
2. Administración de operadores con permisos específicos, MFA y recuperación
   segura. Actualmente sólo existe la autoridad explícita global.
3. Estado de integraciones y fallos por empresa, sin exponer secretos.
4. Métricas del ecosistema con filtros territoriales, monedas comparables y
   exclusión identificable de datos de prueba en métricas comerciales.
5. Opcionales: suscripciones, subdominio propio y sesiones de soporte con
   autorización, duración y auditoría. No se implementa suplantación automática.
