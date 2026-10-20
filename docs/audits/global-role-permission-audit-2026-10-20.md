# Auditoría global de permisos: propuesta de corrección

## Causa y límite observado

`role_permissions` es una matriz global. Su trigger genérico insertaba eventos
en `audit_logs`, una tabla que requiere una organización. Al ejecutar 0111 sin
sesión de usuario ni contexto empresarial, la guarda rechazó el evento porque
había dos organizaciones activas. La transacción completa se revirtió:
0111/0112 no se registraron, Facturas continuó en `read` y el resumen conservó
su definición anterior.

Elegir una empresa arbitraria daría una atribución falsa a un cambio global.
Deshabilitar auditoría o relajar el aislamiento de `audit_logs` tampoco es una
solución aceptable.

## Diseño acotado

- Tabla dedicada `role_permission_audit_events`, global y sin `organization_id`.
- Trigger dedicado exclusivamente a `role_permissions`, con eventos para
  INSERT, UPDATE significativo y DELETE. No se registran cambios exclusivos
  de marcas de tiempo.
- Actor autenticado si existe `auth.uid()`; de lo contrario actor de sistema.
  Se conserva el usuario de conexión real, sin inventar un usuario de negocio,
  organización ni aceptar un marcador de fuente para falsear identidad.
- Datos auditados limitados a la matriz de permisos. No contiene facturas,
  clientes ni datos operativos.
- RLS con una política restrictiva de denegación y sin políticas permisivas
  ni concesiones a roles de aplicación (el único GRANT es al propietario
  existente, que ya posee esos derechos):
  no se ofrece una nueva vista global a usuarios de empresas ni un endpoint.
- Auditoría y guardas de tablas tenant permanecen intactas. Los eventos
  históricos no se trasladan, eliminan ni recrean.

El acceso operativo a este registro por una interfaz de administración global
queda fuera de alcance. El propietario de base puede inspeccionarlo mediante
el canal administrativo ya existente.

## Orden especial de aplicación

Las migraciones 0111 y 0112 ya fusionadas son inmutables. La nueva corrección
0113 no debe registrarse primero: Drizzle podría saltarse las anteriores al
consultar el mayor timestamp aplicado.

El generador `scripts/prepare-dispatcher-audit-release.py` produce SQL, nunca
lo ejecuta ni solicita credenciales. Para una base verificada en 0110:

1. Bloquea ledger y matriz; comprueba receipt 0110 y ausencia de las tres nuevas
   migraciones. Verifica las huellas de función y ledger completo obtenidas
   en un preflight reciente y que la ejecución normal de triggers esté activa.
2. Exige que no existan la tabla ni la función nuevas de auditoría. Extrae sus
   definiciones completas y exactas de 0113, crea ambos objetos sin adjuntar aún
   el trigger, usa CREATE estricto para rechazar creaciones concurrentes,
   habilita RLS y revoca todas las concesiones no-owner heredadas,
   exclusivamente sobre esos dos objetos recién creados. No usa funciones stub.
   Después ejecuta 0113 íntegro sin registrar ningún avance.
3. Aplica los archivos exactos 0111 y 0112.
4. Repite 0113, comprueba permisos y conservación de ACL, propietario y
   configuración de seguridad de la función.
5. Inserta los hashes SHA-256 y timestamps canónicos 0111, 0112, 0113, en ese
   orden, y confirma la única transacción.

Cualquier error revierte DDL, eventos, permisos, función y ledger. No se
modifican hashes históricos. El generador no es un migrador global y no aplica
otras migraciones pendientes. Un estado diferente de 0110 exige inspección;
no se debe reintentar a ciegas.

Ejemplo de preparación, sustituyendo la huella por una lectura recién verificada:

```sh
python3 scripts/prepare-dispatcher-audit-release.py \
  --expected-summary-md5 <huella_md5_verificada> \
  --expected-ledger-md5 <huella_ledger_verificada> > /tmp/release-0111-0113.sql
```

La huella del ledger se obtiene con `md5(string_agg(id::text || ':' ||
created_at::text || ':' || hash, ',' ORDER BY id))` sobre
`drizzle.__drizzle_migrations`. Se conserva incluso si existen hashes históricos
no canónicos previamente verificados; el wrapper no los reescribe.

La huella detecta cambios concurrentes; no sustituye revisar que la definición
actual y sus dependencias sean equivalentes al supuesto probado.

## Verificación local

- PostgreSQL 17.9: 15/15 pruebas aprobadas con esquema focal y dos empresas,
  incluyendo evento de reserva tenant B y ejecución de la suite SQL de CI.
- Cubre las tres operaciones auditadas, no-op, actor autenticado/sistema,
  marcadores E2E/fuente sin efecto evasivo, denegación de acceso de aplicaciones,
  repetición no destructiva y rollback de DDL, eventos, permisos y ledger.
- Casos negativos: drift de columnas, defaults, constraints, policies y trigger;
  huellas de función/ledger incorrectas, modo replica y migración registrada.
- Generador sin conexión: 4/4 pruebas aprobadas.
- Preparador/replay Drizzle: 59/59 pruebas unitarias aprobadas.
- Lint de migración, journal de 114 entradas, sintaxis YAML y diff: aprobados.
- Revisión independiente SQL, wrapper y CI: sin bloqueantes.
- Lectura remota de versión: PostgreSQL 17.6. Las aserciones de representación
  de defaults/constraints fallan cerradas si cambia el formato; se debe mantener
  esa comprobación al aplicar, no omitirla para forzar compatibilidad.

No se ejecutó el replay completo del esquema en este entorno. El workflow RLS
mantiene su replay ascendente habitual y añade el harness aislado del orden
especial; la suite SQL también se ejecutará contra el esquema real en CI.
No se repitió la batería frontend porque el parche no cambia su código.

## Default privileges de plataforma y alcance del preparador

Un intento posterior con el SQL inicial fue rechazado por la guarda owner-only,
con rollback completo. La plataforma asigna por defecto permisos de tabla y
función a roles adicionales de sandbox. Revocar solamente los roles estándar
no elimina esas concesiones; la guarda de 0113 actuó correctamente.

El preparador actualizado no modifica DEFAULT PRIVILEGES, roles, memberships,
objetos existentes ni los bytes/hashes de 0111–0113. La normalización local de
ACL ocurre en la misma transacción, sólo sobre la tabla y función nuevas, antes
de ejecutar el contenido canónico completo de 0113. Sólo el modo de creación
del preámbulo cambia a CREATE estricto, sin IF NOT EXISTS ni OR REPLACE; las
columnas, constraints, defaults y cuerpo de función son los canónicos. La tabla usa UUID: no crea
secuencias ni requiere cambiar sus permisos. Si alguno de los dos objetos ya
existe, se aborta antes de modificarlo y se exige inspeccionar el estado.

0113 crudo requiere defaults compatibles con su contrato owner-only, o este
preparador especial para el estado verificado en 0110. No se afirma que ejecutar
el migrador global sin ese preámbulo sea portable a plataformas con grants
adicionales. No hace falta una nueva migración: el estado final sigue siendo
exactamente el contrato de 0113, sin avanzar el ledger antes de 0111/0112.

Las pruebas focales reproducen grants predeterminados de SELECT/INSERT en tablas,
EXECUTE en funciones y SELECT/USAGE en secuencias para dos roles BYPASSRLS sin
superusuario. Verifican éxito del preparador, rechazo del 0113 crudo, conservación
de defaults, ACL y objetos ajenos, ausencia de nuevas secuencias, hashes canónicos,
rollback total ante fallo posterior y rechazo de objetos preexistentes. También
mantienen los doce casos anteriores. Servidor temporal detenido al terminar.

## Estado y siguiente paso

La corrección de auditoría 0113 ya se fusionó mediante PR303 y su CI terminó
verde. El intento de aplicar la transacción 0111–0113 fue rechazado por la
guarda owner-only debido a los default grants de plataforma; se comprobó el
rollback completo. No se alteraron los hashes ni se registraron las migraciones.

El ajuste del preparador descrito arriba está preparado y probado localmente,
aún sin aplicar. Requiere un nuevo PR, revisión y CI antes de un nuevo intento.
La aplicación deberá usar una nueva lectura de huellas/estado y respetar la
autorización del destino. La publicación del frontend es una etapa separada.
