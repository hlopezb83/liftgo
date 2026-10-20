# Dispatcher: aislamiento de superficies financieras

## Diagnóstico

En la versión base `7958992246023206f927891772d6fc5ff3b90a8f`, la matriz
histórica concedía `dispatcher / Facturas / read`, mientras que una migración
posterior retiraba el acceso financiero en las políticas de tablas. El menú y
las rutas seguían aceptando ese permiso anterior. Estado de resultados compartía
el módulo Reportes con los reportes operativos.

La comprobación UI mostró módulos financieros visibles, Facturas vacía y un
detalle conocido con «Factura no encontrada». Eso no certifica la ausencia de
acceso por otras funciones. La revisión de código identificó adicionalmente
`get_customer_summary` como `SECURITY DEFINER`: admitía dispatcher y devolvía
facturas y totales. No se ha afirmado ni comprobado explotación de ese camino en
el entorno publicado.

## Corrección

- Resolver permisos efectivos de dispatcher como `none` para módulos financieros,
  incluso si la matriz remota o cacheada conserva permisos anteriores.
- Reutilizar la resolución en navegación, creación rápida y guardas de rutas;
  proteger por separado Estado de resultados sin quitar Reportes operativos.
- No montar reportes financieros por selección ni por `?type=`, ni paneles,
  enlaces o acciones de facturación en reservas, extensiones y clientes.
- Omitir búsquedas de facturas para dispatcher y separar caché por identidad y
  acceso. No mostrar resultados financieros antiguos tras cambiar de rol.
- Conservar reservas, entregas, devoluciones, calendario y reportes de utilización.
- Mostrar la restricción efectiva en la matriz administrativa; no ofrecer una
  concesión que la política operativa no admite.
- `0111_dispatcher_financial_permissions.sql` alinea únicamente los permisos
  financieros de dispatcher. No modifica otros roles ni políticas de datos.
- `0112_dispatcher_customer_summary.sql` evita consultar/devolver facturas y
  totales para dispatcher efectivo, conservando reservas y el contrato JSON.

Las restricciones de interfaz no sustituyen RLS ni la autorización en servidor.
La migración del resumen conserva el ámbito de organización y los roles
financieros prioritarios. Los reportes operativos no reciben nuevos permisos.

## Publicación y límites

Este cambio se prepara localmente. No se han aplicado migraciones, modificado
credenciales, publicado código ni desplegado. La verificación en vivo requiere
aplicar las migraciones revisadas por el flujo autorizado y publicar el frontend,
luego repetir navegación y enlaces directos con una cuenta dispatcher.

La comprobación completa de RLS y reconstrucción de historial debe ejecutarse en
CI contra una base efímera; el resultado local focalizado no certifica el ledger
ni todas las políticas del proyecto publicado.

## Verificación local (20 de octubre de 2026)

- Vitest integral, 647 archivos / 4,272 pruebas: 646 archivos y 4,270 pruebas
  aprobadas. Un archivo de calendario falló en dos casos porque la ejecución
  ya había leído su mock anterior a la incorporación del nuevo hook.
- Después de corregir ese mock, revalidación final de calendario, doble
  activación, las 13 rutas financieras y RoleGuard: 4 archivos / 31 pruebas
  aprobadas. No se presenta el pase integral original como un pase limpio;
  CI debe repetirlo desde el snapshot final.
- TypeScript final: aprobado. Build de producción: aprobado con backend
  ficticio loopback, sin acceso al backend publicado.
- ESLint global: sin errores, con una advertencia de complejidad en RoleGuard;
  refactorizada y revalidada sin advertencias en ese archivo. El resto del pase
  global no tuvo advertencias.
- Arquitectura y journal de 113 migraciones: aprobados.
- PostgreSQL 17 local: 8/8 pruebas del esquema focal de 0111/0112, incluyendo
  aislamiento entre empresas, roles prioritarios, portal, ACL e idempotencia.
  El servidor temporal fue detenido y la base sintética eliminada.
- Revisión independiente frontend y SQL: sin bloqueantes pendientes.

Pendientes antes de declarar publicación lista: PR/CI sobre el commit final,
replay completo SQL/RLS y prueba de navegador de la compilación. Las pruebas de
componentes y rutas anteriores no son un recorrido end-to-end en navegador.
