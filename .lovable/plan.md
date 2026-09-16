# Auditoría de solo lectura — cierre del tramo 8.1 y preflight del Lote 2

Sin cambios de código, sin migraciones, sin escrituras. Solo lectura de archivos y consultas `SELECT` contra la base productiva.

## Resumen para decidir

- El asignador de folio REP tiene un solo punto de entrada en código y la organización siempre sale del propio pago. No encontré ningún uso desde el navegador.
- **Hallazgo importante de despliegue:** la base productiva todavía tiene solo la versión vieja de la función (dos datos) y sigue ejecutable por cualquier usuario autenticado. La versión endurecida existe en el repositorio pero no está aplicada. Mientras no se aplique, el hueco de aislamiento sigue abierto en producción.
- **Segundo hallazgo:** el folio de los reportes de retroalimentación ya se genera por empresa (`FB-0001` reinicia en cada empresa), pero la tabla conserva una restricción única global sobre `folio`. Con una segunda empresa, su primer reporte fallaría. Esto ya no es un índice suelto: es una *constraint*, lo que cambia el procedimiento de retiro.
- Datos actuales: cero duplicados, cero nulos problemáticos, una sola empresa activa. El momento de menor riesgo sigue siendo antes de dar de alta la segunda empresa.

## 1. Quién llama al asignador

Un único punto de entrada: `supabase/functions/_shared/repFolio.ts:104` (firma de tres datos) con reintento a la histórica en `:124`, solo como defensa de emergencia si falta la migración, y registrando el incidente en `:120`.

Consumidores:

- `supabase/functions/stamp-payment-complement/handler.ts:622` — cliente admin del servidor; la organización viene del contexto verificado del pago.
- `supabase/functions/reconcile-stamping-invoices/index.ts:97` — cliente admin del cron; organización tomada de la fila (`index.ts:99`).
- Pruebas: `supabase/functions/_shared/repFolio_test.ts`, `stamp-payment-complement/handler_test.ts`, `supabase/tests/rls/rep_folio_org_scope.sql`.

Búsqueda en `src/**`: cero llamadas (solo etiquetas y mensajes en `auditTrailLabels.ts:85`, `usePayments.ts:23`, `pgErrorCatalog.ts:56`). Ningún script llama la RPC.

Estado real en la base (consulta ejecutada):

```sql
select p.oid::regprocedure::text sig, p.prosecdef, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') svc_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'assign_stamped_rep_number';
```

Resultado: **una sola fila**, `assign_stamped_rep_number(uuid,text)`, `SECURITY DEFINER`, `search_path=public`, ejecutable por `authenticated` y por `service_role`. La firma de tres datos no existe aún en producción.

Riesgo vigente: hasta que se aplique la migración, un administrador autenticado de una empresa puede invocar la función vieja sobre un pago de otra. Hoy no es explotable porque hay una sola empresa, pero debe cerrarse antes del alta de la segunda.

## 2. Ruta de recuperación de REP timbrados sin folio

`reconcile-stamping-invoices/index.ts:191-207` selecciona pagos con timbre y sin folio, filtrando por empresa solo en ejecución manual (`:200`), y el cron recorre todas. `recoverRepFolio` (`:67-113`) es idempotente: sale temprano si ya hay folio (`:77`), reutiliza `rep_folio` antes de volver a consultar al proveedor (`:79`), nunca re-timbra y ante fallo deja `rep_error_message` (`:109`) devolviendo `rep_folio_pending`.

Casos que aún pueden dejar un REP timbrado sin folio (todos recuperables, ninguno silencioso):

- El proveedor no responde en la consulta del folio (`:88-94`): queda pendiente hasta el siguiente ciclo, sin límite de reintentos que lo abandone.
- Choque de folio real: hoy el índice es global, así que dos empresas con proveedores distintos pueden generar el mismo `CP-0001`; el segundo quedaría permanentemente pendiente. Este es el motivo del Lote 2.
- El pago sin empresa se rechaza antes de escribir (`repFolio.ts:94`) y queda pendiente por diseño.
- Si la migración no está aplicada, cada asignación pasa por la ruta de emergencia y deja un error en observabilidad, aunque el folio sí se asigne.

Durante esta auditoría no se ejecutó ninguna escritura: solo `SELECT` y lectura de archivos.

## 3. Preflight del Lote 2 (resultados reales, sin datos personales)

Pagos:

```sql
select count(*) total,
       count(rep_number) con_folio,
       count(*) filter (where organization_id is null) sin_empresa,
       count(distinct organization_id) empresas
from public.payments;
-- total 82 · con_folio 25 · sin_empresa 0 · empresas 1

select count(*) from (
  select organization_id, rep_number from public.payments
  where rep_number is not null group by 1,2 having count(*) > 1) d;  -- 0

select count(*) from (
  select rep_number from public.payments where rep_number is not null
  group by 1 having count(distinct organization_id) > 1) d;          -- 0

select count(*) from public.payments
where rep_number is null and rep_folio is not null;                  -- 0
```

Índices y restricciones vigentes:

- `payments`: solo `payments_rep_number_uidx` — índice único parcial sobre `rep_number` cuando no es nulo. No hay constraint; se puede retirar con `DROP INDEX CONCURRENTLY`.
- `feedback_reports`: conviven `feedback_reports_folio_key` (**constraint** `UNIQUE (folio)`, global) y `feedback_reports_organization_folio_key` (**constraint** `UNIQUE (organization_id, folio)`, ya creada en la migración 0016). Datos: 1 reporte, 0 nulos, 0 duplicados por empresa y 0 globales.
- El folio de reportes se genera por empresa: `generate_feedback_number()` usa `next_organization_document_counter('feedback', 1)`, así que la restricción global es incompatible con una segunda empresa.
- Dependencias en código del folio de reportes: `src/lib/errors/pgErrorCatalog.ts:55` traduce el nombre de la restricción global a un mensaje seguro; `src/features/feedback/hooks/useCreateFeedback.ts:47-61` inserta sin enviar empresa (la fija el servidor). Nada más depende del nombre.

## 4. Orden seguro, paradas y reversa (conceptual, sin aplicar)

Secuencia propuesta, cada paso con verificación antes del siguiente:

1. Aplicar primero la migración del tramo 8.1 ya aprobada (cierra el aislamiento del asignador) y luego desplegar las funciones de servidor. Sin esto, el Lote 2 se monta sobre una función insegura.
2. Preflight repetido en el momento de la ventana: los cuatro conteos de pagos en cero y los dos de reportes en cero.
3. Pagos: crear el índice único por empresa sobre `(organization_id, rep_number)` en modo concurrente y fuera de transacción; verificar que quede válido; solo después retirar el global, también concurrente.
4. Reportes: el global es una *constraint*, no un índice suelto, así que no se retira de forma concurrente — se elimina la restricción en una transacción breve, apoyándose en que la restricción por empresa ya existe y cubre el caso. Es una operación de metadatos, pero toma bloqueo exclusivo momentáneo.
5. Después: ajustar el catálogo de mensajes de error para la restricción por empresa, sin dejar de traducir la antigua mientras conviva.

Condiciones de parada, cualquiera aborta la ventana:

- Aparece un duplicado por empresa en el preflight, o un mismo folio en dos empresas.
- El índice concurrente queda inválido.
- La migración del tramo 8.1 no está aplicada o las funciones aún no se desplegaron.
- Ya existe una segunda empresa con documentos timbrados (la reversa deja de ser segura).
- Hay pagos en proceso de timbrado o reportes pendientes de folio.

Reversa conceptual: mientras solo se hayan creado índices, basta retirarlos. Una vez retirado el global, la reversa exige que no existan valores repetidos entre empresas; si ya los hay, no hay vuelta atrás sin renumerar. Por eso la ventana debe ocurrir **antes** del alta de la segunda empresa.

No se propone ejecutar nada hasta que haya decisión explícita y una segunda empresa en un entorno aislado para ensayar.

## 5. Decisiones humanas que siguen pendientes

- Proveedores: registro por empresa o tabla puente compartida.
- Modelos de equipo: seguir como catálogo compartido o volverlo por empresa.
- Cuentas bancarias: si se define alguna unicidad y con qué alcance.
- Fecha y ventana del alta de la segunda empresa, que condiciona todo el Lote 2.
- Aplicar en producción la migración del tramo 8.1 y desplegar las funciones: requiere autorización explícita.
