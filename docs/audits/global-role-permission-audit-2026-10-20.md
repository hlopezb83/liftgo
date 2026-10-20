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
2. Preinstala el cuerpo idempotente exacto de 0113 sin registrar ningún avance.
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

- PostgreSQL 17.9: 11/11 pruebas aprobadas con esquema focal y dos empresas,
  incluyendo evento de reserva tenant B y ejecución de la suite SQL de CI.
- Cubre las tres operaciones auditadas, no-op, actor autenticado/sistema,
  marcadores E2E/fuente sin efecto evasivo, denegación de acceso de aplicaciones,
  repetición no destructiva y rollback de DDL, eventos, permisos y ledger.
- Casos negativos: drift de columnas, defaults, constraints, policies y trigger;
  huellas de función/ledger incorrectas, modo replica y migración registrada.
- Generador sin conexión: 3/3 pruebas aprobadas.
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

## Estado y siguiente paso

Parche local preparado. No se ha aplicado esta nueva migración ni se ha
publicado la aplicación. La revisión y confirmación del alcance nuevo deben
preceder cualquier aplicación remota. Primero publicar/revisar el parche en
PR y verificar CI. Después autorizar la transacción especial de las tres
migraciones y la publicación del frontend validado, con nueva lectura de
huellas/estado inmediatamente antes de aplicar.
