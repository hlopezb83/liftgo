# Tramo 8 · Propuesta de migraciones reversibles de unicidad por empresa

Base: commit `7b0f5632b5e6ef201c24c35caa10a65a1f11e7b7` (8.8.26) y
`docs/multiempresa/tramo-7-colisiones-unicidad.md`.

Esto es **solo el diseño**. No se crean migraciones, no se ejecuta SQL y no se toca
producción. Cada lote requiere aprobación humana explícita antes de existir como archivo.

## Idea en una frase

Hoy cada catálogo tiene "una sola lista para todo el sistema". La propuesta es darle a cada
empresa su propia lista, creando primero el índice nuevo y sólo después retirando el viejo,
de modo que en cualquier momento se pueda volver atrás.

## Premisas verificadas (tramo 7)

- Una sola organización activa, cero duplicados y cero `organization_id` nulos en las nueve
  claves objetivo.
- Índices vigentes confirmados en `pg_index`, incluidos los filtros parciales:
  `forklifts_name_unique` y `forklifts_serial_number_unique` con `deleted_at IS NULL`,
  `parts_inventory_sku_unique` y `payments_rep_number_uidx` con la clave `NOT NULL`,
  `suppliers_rfc_unique_idx` con `upper(btrim(rfc))` y `deleted_at IS NULL`,
  `feedback_reports_organization_folio_key` ya existente junto al global
  `feedback_reports_folio_key`.
- El choque entre empresas **todavía no es observable**: con una empresa, el índice por
  organización es estrictamente más permisivo que el global y no puede rechazar fila alguna.

## Regla común a los tres lotes

Orden seguro, siempre igual:

```text
preflight SELECT  ->  CREATE UNIQUE INDEX CONCURRENTLY (nuevo)
      ->  verificar indisvalid + reconteo  ->  DROP INDEX CONCURRENTLY (viejo)
rollback: recrear el viejo CONCURRENTLY  ->  DROP del nuevo CONCURRENTLY
```

**No pueden ir dentro de una transacción:** `CREATE INDEX CONCURRENTLY` y
`DROP INDEX CONCURRENTLY`. La migración de cada lote debe declararse sin envoltura
transaccional (o dividirse en pasos), y cada paso se ejecuta y verifica por separado. Si un
`CONCURRENTLY` falla deja el índice en estado `INVALID`: hay que eliminarlo
(`DROP INDEX CONCURRENTLY`) antes de reintentar, nunca dejarlo a medias.

### Preflight genérico (solo lectura, se repite justo antes de cada lote)

```sql
-- 1) nulos de organización en la tabla objetivo
select count(*) filter (where organization_id is null) as sin_organizacion, count(*) as filas
from public.<tabla>;

-- 2) colisiones bajo la clave propuesta (debe dar 0 filas)
select organization_id, <clave>, count(*)
from public.<tabla>
where <mismo filtro parcial del índice>
group by 1,2 having count(*) > 1;
```

### Verificación posterior a cada creación

```sql
select i.indisvalid, i.indisready, c.relname
from pg_index i join pg_class c on c.oid = i.indexrelid
where c.relname = '<indice_nuevo>';
```
Debe devolver `indisvalid = true`. Sólo entonces se retira el índice global.

---

## Lote 1 — catálogos operativos (sin efecto fiscal)

Requiere aprobación humana: **sí**.

Índices nuevos propuestos (conservan los filtros parciales actuales):

| Índice nuevo | Definición |
| --- | --- |
| `forklifts_org_name_unique` | `(organization_id, name) WHERE deleted_at IS NULL` |
| `forklifts_org_serial_number_unique` | `(organization_id, serial_number) WHERE serial_number IS NOT NULL AND deleted_at IS NULL` |
| `mechanics_org_name_unique` | `(organization_id, name)` |
| `drivers_org_name_unique` | `(organization_id, name)` |
| `parts_inventory_org_sku_unique` | `(organization_id, sku) WHERE sku IS NOT NULL` |
| `prospects_org_stage_order_uniq` | `(organization_id, stage, stage_order)` |

Paso 1 — crear (fuera de transacción):

```sql
create unique index concurrently forklifts_org_name_unique
  on public.forklifts (organization_id, name) where deleted_at is null;
create unique index concurrently forklifts_org_serial_number_unique
  on public.forklifts (organization_id, serial_number)
  where serial_number is not null and deleted_at is null;
create unique index concurrently mechanics_org_name_unique
  on public.mechanics (organization_id, name);
create unique index concurrently drivers_org_name_unique
  on public.drivers (organization_id, name);
create unique index concurrently parts_inventory_org_sku_unique
  on public.parts_inventory (organization_id, sku) where sku is not null;
create unique index concurrently prospects_org_stage_order_uniq
  on public.prospects (organization_id, stage, stage_order);
```

Paso 2 — verificar los seis con la consulta de `indisvalid` y repetir el conteo de
colisiones del preflight.

Paso 3 — retirar los globales (fuera de transacción):

```sql
drop index concurrently public.forklifts_name_unique;
drop index concurrently public.forklifts_serial_number_unique;
drop index concurrently public.mechanics_name_unique;
drop index concurrently public.drivers_name_unique;
drop index concurrently public.parts_inventory_sku_unique;
drop index concurrently public.prospects_stage_order_uniq;
```

Rollback del lote 1: recrear cada índice global con su definición original
(`create unique index concurrently forklifts_name_unique on public.forklifts (name) where deleted_at is null;`
y equivalentes) y después `drop index concurrently` sobre los seis nuevos. Es seguro
mientras no se haya dado de alta la segunda empresa; después del alta, recrear el global
puede fallar si ya existen valores repetidos entre empresas — ese es el punto de no retorno
y debe quedar registrado en la aprobación.

Impacto en la aplicación: ninguno en consultas; sólo cambian los nombres de restricción de
los mensajes de error. El catálogo de errores (`pgErrorCatalog.ts`) tendría que mapear los
nombres nuevos además de los actuales — cambio de código posterior, fuera de este tramo.

---

## Lote 2 — folios fiscales y de reportes

Requiere aprobación humana: **sí** (toca numeración fiscal).

```sql
-- payments: folio de complemento de pago por empresa
create unique index concurrently payments_org_rep_number_uidx
  on public.payments (organization_id, rep_number) where rep_number is not null;
-- verificar indisvalid = true, luego:
drop index concurrently public.payments_rep_number_uidx;

-- feedback_reports: retirar el global redundante; el par por empresa ya existe
drop index concurrently public.feedback_reports_folio_key;
```

Preflight específico:

```sql
select count(*) as pagos_org_distinta_de_factura
from public.payments p join public.invoices i on i.id = p.invoice_id
where p.organization_id is distinct from i.organization_id;   -- debe ser 0

select organization_id, rep_number, count(*)
from public.payments where rep_number is not null
group by 1,2 having count(*) > 1;                              -- debe ser 0 filas

select count(*) from pg_class where relname = 'feedback_reports_organization_folio_key';
                                                               -- debe ser 1 antes de soltar el global
```

Impacto: el generador de folio REP deja de competir entre empresas; cada empresa podrá
numerar su propia serie. En `feedback_reports` no hay cambio funcional porque el par
`(organization_id, folio)` ya garantiza la unicidad real.

Rollback del lote 2:

```sql
create unique index concurrently payments_rep_number_uidx
  on public.payments (rep_number) where rep_number is not null;
drop index concurrently public.payments_org_rep_number_uidx;

create unique index concurrently feedback_reports_folio_key
  on public.feedback_reports (folio);
```
Mismo punto de no retorno: tras el alta de la segunda empresa, recrear los globales puede
fallar por folios repetidos legítimos.

Nota de dependencia: si el asignador de folio REP hoy calcula el siguiente número mirando
toda la tabla, debe pasar a calcularlo por organización **antes o junto con** este lote.
Hay que auditar ese punto antes de aprobar el SQL — pendiente marcado.

---

## Lote 3 — `suppliers.rfc`: dos alternativas, sin elegir

Requiere decisión humana: **sí, y es previa a cualquier SQL.** No se propone una migración
ganadora.

**Alternativa A — proveedor propio de cada empresa.**

```sql
create unique index concurrently suppliers_org_rfc_unique_idx
  on public.suppliers (organization_id, upper(btrim(rfc)))
  where rfc is not null and btrim(rfc) <> '' and deleted_at is null;
-- verificar, luego:
drop index concurrently public.suppliers_rfc_unique_idx;
```
Ventaja: mínima, reversible, sin cambios de esquema ni de código. Costo: el mismo proveedor
real queda duplicado como fila independiente en cada empresa.

**Alternativa B — proveedor como identidad global con tabla puente**
(`organization_suppliers`, igual que `organization_customers`). Implica tabla nueva, backfill,
RLS, grants, cambio de consultas y de PDFs de cuentas por pagar. Ventaja: un solo proveedor
real con datos comerciales por empresa. Costo: es un tramo completo, no un lote de índices.

La alternativa B **no** se detalla como SQL aquí: sólo tiene sentido diseñarla si el usuario
la elige, y su alcance excede un cambio de índice.

---

## Pruebas por lote (RLS/smoke A/B desde base limpia)

Para cada lote, antes de aceptarlo:

1. Fixture que crea organizaciones A y B con contexto explícito (mismo patrón de
   `supabase/tests/rls/admin_cross_org.sql`).
2. Caso positivo: el mismo valor de la clave se registra en A y en B sin error — es el
   comportamiento que hoy no es observable y que el índice nuevo habilita.
3. Caso negativo: repetir el valor **dentro de A** sigue fallando con la restricción nueva.
4. Aislamiento: un usuario de A no lee ni modifica la fila de B (las policies
   `org_scope_isolation` no cambian).
5. Soft delete: en flota y proveedores, una fila borrada lógicamente libera la clave.
6. Smoke SQL: verificar por nombre que el índice nuevo existe y es `indisvalid`, y que el
   global retirado ya no aparece.
7. Lote 2 además: alta de folio REP en A y en B con el mismo número, y verificación de que
   el asignador de folios trabaja por empresa.

## Fuera de alcance de este tramo

No se toca `customers.rfc`, `equipment_models`, `organizations`, `user_roles`,
`role_permissions` ni `customer_portal_accounts`, y no se añade unicidad a `bank_accounts`.

## Puntos que requieren aprobación humana

1. Aprobar el lote 1 y su ventana de ejecución.
2. Aprobar el lote 2, reconociendo que toca numeración fiscal.
3. Auditar y, si hace falta, ajustar el asignador de folio REP para que numere por empresa
   antes o junto con el lote 2.
4. Elegir la alternativa A o B para proveedores (o posponer el lote 3).
5. Aceptar que, una vez dada de alta la segunda empresa, el rollback a índices globales
   puede volverse imposible: el momento de aplicar es **antes** de esa alta.
6. Autorizar el cambio posterior de código que mapee los nombres de restricción nuevos en
   los mensajes de error.

---

## Decisión adoptada e implementación (migración 0029)

Fecha: 2026-09-17. Archivo: `drizzle/migrations/0029_multi_org_unique_scope_by_organization.sql`.
Prueba: `supabase/tests/rls/multi_org_unique_scope_ab.sql` (la corre el runner por
directorio, no hace falta tocar el workflow).

### Proveedores: alternativa A

Se adopta la **alternativa A**: el proveedor es propio de cada empresa. El índice
`suppliers_rfc_unique_idx` pasa a incluir `organization_id`, conservando exactamente el
mismo filtro parcial (`rfc IS NOT NULL AND btrim(rfc) <> '' AND deleted_at IS NULL`) y la
misma normalización (`upper(btrim(rfc))`).

Consecuencias aceptadas:

- Un mismo proveedor real puede existir como dos filas independientes, una por empresa,
  con datos de contacto y cuentas bancarias distintos. No hay deduplicación entre empresas.
- No hay vista consolidada de gasto por proveedor entre empresas; cualquier reporte de ese
  tipo tendría que agrupar por RFC normalizado, no por `supplier_id`.
- `customers` y `equipment_models` **siguen siendo catálogos globales**: el cliente se
  comparte y la relación comercial vive en `organization_customers`; el modelo de equipo es
  un catálogo de fabricante sin datos de negocio.

### Ventana de bloqueo: por qué no hay `CONCURRENTLY`

El migrador de Drizzle (`drizzle-orm/pg-core/dialect.js`) envuelve **toda** la corrida en
`session.transaction(...)`. `CREATE INDEX CONCURRENTLY` y `DROP INDEX CONCURRENTLY` no
pueden ejecutarse dentro de una transacción (SQLSTATE 25001), así que la migración usa
índices bloqueantes:

- `CREATE UNIQUE INDEX`: toma `ShareLock` sobre la tabla — bloquea escrituras, no lecturas.
- `DROP INDEX`: toma `AccessExclusiveLock` — bloquea todo sobre esa tabla.

Con el tamaño actual de las tablas (decenas a pocos miles de filas) la ventana estimada es
menor a 1 s por tabla y toda la migración corre en una sola transacción: o entra completa o
no entra nada. Aun así conviene aplicarla fuera de horario de operación.

### Preflight fail-closed

La migración aborta antes de crear cualquier índice si encuentra:

1. filas con `organization_id` nulo que quedarían fuera del alcance del índice nuevo;
2. duplicados **dentro de una misma empresa** para cualquiera de las claves;
3. ausencia de `feedback_reports_organization_folio_key` (el par por empresa que sustituye
   al folio global);
4. pagos cuya empresa no coincide con la de su factura.

Un postflight verifica que los ocho índices nuevos existen, son `indisunique`,
`indisvalid`/`indisready`, y que los globales equivalentes ya no están.

### Folio REP: auditoría de callers (solo lectura, sin cambios)

`assign_stamped_rep_number(uuid, text, uuid)` toma la empresa de la fila de `payments`,
exige membresía interna verificada y usa el parámetro únicamente para **rechazar** cruces;
el wrapper de dos argumentos delega con `NULL`. `repFolio.ts`,
`stamp-payment-complement` y `reconcile-stamping-invoices` obtienen la empresa del pago ya
leído en servidor, nunca del navegador. La idempotencia de reintentos no cambia (si el pago
ya tiene folio, se devuelve sin escribir) y el formato `CP-####` se conserva: lo único nuevo
es que dos empresas pueden usar el mismo número.
