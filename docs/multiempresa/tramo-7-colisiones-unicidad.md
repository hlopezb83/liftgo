# Tramo 7 · Conteo de colisiones de unicidad (solo lectura)

Base: commit `6d4843422046fef3471a5b84360b4c6e42dff04e` (8.8.25).
Todo el contenido proviene de consultas `SELECT` contra la base productiva. **No** se
crearon migraciones, índices, constraints ni tablas puente, y no se ejecutó ningún
`INSERT`/`UPDATE`/`DELETE`/DDL. Este análisis queda **separado** de cualquier aprobación
posterior de índices.

Sin PII: solo se reportan conteos por tabla/clave/organización. Ningún nombre, RFC,
número de serie, SKU o folio aparece en este documento.

## 1. Índices únicos vigentes que condicionan el conteo

Leídos de `pg_index` (definiciones, no datos):

| Tabla | Índice único | Particularidad que cambia el resultado |
| --- | --- | --- |
| forklifts | `forklifts_name_unique (name)` | parcial: `WHERE deleted_at IS NULL` |
| forklifts | `forklifts_serial_number_unique (serial_number)` | parcial: `WHERE serial_number IS NOT NULL AND deleted_at IS NULL` |
| mechanics | `mechanics_name_unique (name)` | global, sin filtro |
| drivers | `drivers_name_unique (name)` | global, sin filtro |
| parts_inventory | `parts_inventory_sku_unique (sku)` | parcial: `WHERE sku IS NOT NULL` |
| prospects | `prospects_stage_order_uniq (stage, stage_order)` | global, sin filtro |
| payments | `payments_rep_number_uidx (rep_number)` | parcial: `WHERE rep_number IS NOT NULL` |
| feedback_reports | `feedback_reports_folio_key (folio)` **y** `feedback_reports_organization_folio_key (organization_id, folio)` | el global es redundante respecto del par por organización |
| suppliers | `suppliers_rfc_unique_idx (upper(btrim(rfc)))` | expresión normalizada + parcial: `WHERE rfc IS NOT NULL AND btrim(rfc) <> '' AND deleted_at IS NULL` |

Efecto del borrado lógico: en `forklifts` y `suppliers` las filas con `deleted_at`
no ocupan la clave, así que el conteo se hizo únicamente sobre filas vivas (hoy
hay **0** filas con borrado lógico en ambas tablas, por lo que el filtro no altera nada).
Las expresiones normalizadas (`upper(btrim(...))` en proveedores) se replicaron tal cual;
para el resto de los textos se comparó en minúsculas y sin espacios extremos, lo que es
**más estricto** que el índice actual (detecta colisiones que hoy pasarían por ser
mayúsculas/minúsculas distintas).

## 2. Consultas usadas

Conteo de colisiones (una sola consulta, agregada):

```sql
with base as (
  select 'forklifts.name' k, organization_id o, lower(btrim(name)) v
    from forklifts where deleted_at is null and name is not null
  union all select 'forklifts.serial_number', organization_id, lower(btrim(serial_number))
    from forklifts where deleted_at is null and serial_number is not null
  union all select 'mechanics.name', organization_id, lower(btrim(name)) from mechanics where name is not null
  union all select 'drivers.name', organization_id, lower(btrim(name)) from drivers where name is not null
  union all select 'parts_inventory.sku', organization_id, lower(btrim(sku)) from parts_inventory where sku is not null
  union all select 'prospects.stage_stage_order', organization_id, stage||'#'||coalesce(stage_order::text,'null') from prospects
  union all select 'payments.rep_number', organization_id, rep_number from payments where rep_number is not null
  union all select 'feedback_reports.folio', organization_id, folio from feedback_reports where folio is not null
  union all select 'suppliers.rfc_norm', organization_id, upper(btrim(rfc))
    from suppliers where deleted_at is null and rfc is not null and btrim(rfc) <> ''
), per_org as (select k, o, v, count(*) n from base group by 1,2,3),
   per_key as (select k, v, count(distinct o) orgs from base group by 1,2)
select b.k as clave,
  count(*) as filas_evaluadas,
  count(*) filter (where b.o is null) as filas_sin_organizacion,
  (select count(*) from per_org p where p.k=b.k and p.n>1) as grupos_duplicados_en_misma_empresa,
  (select coalesce(sum(p.n-1),0) from per_org p where p.k=b.k and p.n>1) as filas_excedentes_misma_empresa,
  (select count(*) from per_key q where q.k=b.k and q.orgs>1) as claves_en_choque_entre_empresas
from base b group by b.k order by b.k;
```

Cobertura del backfill y volumen por tabla: `select count(*), count(*) filter (where organization_id is null)`
sobre cada tabla (variante con `deleted_at is null` para flota y proveedores).

Relación de `payments` y `feedback_reports` con su organización: subconsultas de conteo
comparando `payments.organization_id` contra `invoices.organization_id` y contando
`distinct organization_id` en ambas tablas.

Índices: `select pg_get_indexdef(indexrelid) from pg_index where indisunique and indrelid::regclass::text in (...)`.

## 3. Resultados agregados

### 3.1 Colisiones por clave

| Clave | Filas evaluadas | Sin organización | Grupos duplicados en la misma empresa | Filas excedentes | Claves en choque entre empresas | Clasificación |
| --- | --- | --- | --- | --- | --- | --- |
| forklifts.name | 58 | 0 | 0 | 0 | 0 | cero colisiones |
| forklifts.serial_number | 56 | 0 | 0 | 0 | 0 | cero colisiones |
| mechanics.name | 0 (tabla vacía) | 0 | 0 | 0 | 0 | cero colisiones |
| drivers.name | 0 (tabla vacía) | 0 | 0 | 0 | 0 | cero colisiones |
| parts_inventory.sku | 0 (tabla vacía) | 0 | 0 | 0 | 0 | cero colisiones |
| prospects (stage, stage_order) | 23 | 0 | 0 | 0 | 0 | cero colisiones |
| payments.rep_number | 25 | 0 | 0 | 0 | 0 | cero colisiones |
| feedback_reports.folio | 1 | 0 | 0 | 0 | 0 | cero colisiones |
| suppliers.rfc normalizado | 16 | 0 | 0 | 0 | 0 | cero colisiones |

Las claves con 0 filas evaluadas no aparecen en la consulta agregada porque no hay filas;
se confirmaron vacías con el conteo por tabla de §3.2.

### 3.2 Cobertura del backfill (`organization_id`)

| Tabla | Filas | Filas sin organización |
| --- | --- | --- |
| organizations | 1 | — |
| forklifts (todas / vivas) | 58 / 58 | 0 / 0 |
| mechanics | 0 | 0 |
| drivers | 0 | 0 |
| parts_inventory | 0 | 0 |
| prospects | 23 | 0 |
| payments (todas / con REP) | 82 / 25 | 0 / 0 |
| feedback_reports | 1 | 0 |
| suppliers (todas / vivas) | 39 / 39 | 0 / 0 |

**El backfill dejó asignadas todas las filas objetivo: cero `organization_id` nulos en las
nueve tablas.** Hoy existe **una sola organización activa**, por lo que ningún choque entre
empresas es posible todavía: toda clave repetida sería un duplicado interno, y tampoco hay.

### 3.3 Datos de apoyo

| Medida | Valor |
| --- | --- |
| Flota con borrado lógico | 0 |
| Flota viva sin número de serie | 2 (no ocupan la clave por el índice parcial) |
| Proveedores con borrado lógico | 0 |
| Proveedores sin RFC o con RFC vacío | 23 de 39 (excluidos del índice parcial) |
| Pagos cuya organización difiere de la de su factura | 0 |
| Pagos sin factura / pagos con REP sin factura | 0 / 0 |
| Organizaciones distintas presentes en pagos / reportes | 1 / 1 |
| Reportes de retroalimentación sin folio | 0 |

## 4. Relación de `payments` y `feedback_reports` con su organización

- **payments**: la tabla tiene columna propia `organization_id` y además cuelga de
  `invoices`. Los 82 pagos tienen organización asignada y en **cero** casos difiere de la
  organización de su factura, así que la columna propia y la ruta por factura son hoy
  equivalentes. El folio `rep_number` (complemento de pago) sólo existe en 25 pagos y su
  índice único ignora los nulos; es un folio fiscal que en un esquema multiempresa debe
  numerarse por empresa, igual que ya ocurre con facturas y notas de crédito.
- **feedback_reports**: ya tiene el par único `(organization_id, folio)`. El índice global
  `(folio)` es un residuo histórico: no aporta nada que el par no garantice y sí impediría
  que dos empresas usen su propia serie de folios. Hoy hay un solo reporte, así que
  retirarlo no puede romper datos existentes.

## 5. Contraste con la matriz del tramo 6

| Entidad | Matriz del tramo 6 | Evidencia del tramo 7 | Decisión humana pendiente |
| --- | --- | --- | --- |
| forklifts.serial_number | por organización | 0 colisiones, 0 nulos de organización, 2 filas sin serie | aprobar el lote 1 (sin efecto fiscal) |
| forklifts.name | por organización | 0 colisiones | aprobar el lote 1 |
| mechanics.name | por organización | tabla vacía: cambio sin riesgo | aprobar el lote 1 |
| drivers.name | por organización | tabla vacía: cambio sin riesgo | aprobar el lote 1 |
| parts_inventory.sku | por organización | tabla vacía: cambio sin riesgo | aprobar el lote 1 |
| prospects (stage, stage_order) | por organización | 0 colisiones sobre 23 filas | aprobar el lote 1 |
| payments.rep_number | por organización | 0 colisiones, 0 desalineaciones con la factura | aprobar el lote 2 (folio fiscal) |
| feedback_reports.folio | retirar el índice global | el par por organización ya existe y cubre el caso | aprobar el lote 2 |
| suppliers.rfc | **decisión pendiente**: por organización o tabla puente | 16 RFC vivos, 0 colisiones; 23 proveedores sin RFC | **decidir el modelo antes de cualquier índice** |
| customers.rfc, equipment_models, organizations.slug, user_roles, role_permissions, customer_portal_accounts | global, sin cambio | no se revisaron: quedan globales por diseño | ninguna |
| bank_accounts (cuenta + banco) | unicidad nueva, opcional | fuera del alcance de este conteo | decidir si se quiere la unicidad interna |

## 6. Recomendación reversible por lotes (propuesta, no aprobada)

Con cero colisiones y cero nulos, un índice `(organization_id, clave)` es **estrictamente
más permisivo** que el índice global vigente: no puede rechazar ninguna fila existente. El
momento de menor riesgo sigue siendo **antes de dar de alta la segunda empresa**.

1. **Lote 1 — sin efecto fiscal:** forklifts (nombre y serie), mechanics, drivers,
   parts_inventory, prospects. Crear el índice por organización (conservando los filtros
   parciales actuales de `deleted_at`/nulos), verificar, y sólo después eliminar el global.
   Reversa: recrear el índice global y eliminar el nuevo.
2. **Lote 2 — fiscal/cobranza:** `payments.rep_number` por organización y retiro del índice
   global `feedback_reports_folio_key` (el par por organización ya lo cubre).
   Reversa idéntica: recrear el índice retirado.
3. **Lote 3 — bloqueado por decisión:** `suppliers.rfc`. No se propone SQL hasta definir si
   el proveedor es dato propio de cada empresa o identidad global con tabla puente.
4. Cada lote se acompaña de pruebas RLS/smoke A/B desde base limpia, y el conteo de §3 se
   vuelve a ejecutar inmediatamente antes de aplicar, por si entraron filas nuevas.

## 7. Bloqueos y limitaciones

- No se ejecutó ninguna escritura ni DDL; todo el informe sale de consultas `SELECT`.
- Con una sola organización activa, la categoría "choque entre empresas" es **no
  observable** hoy: el conteo la reporta en cero por ausencia de segunda empresa, no porque
  el riesgo esté descartado. Por eso los índices deben aplicarse antes del alta de la
  segunda empresa.
- Las tablas `mechanics`, `drivers` y `parts_inventory` están vacías: la evidencia es
  concluyente para el riesgo actual, no para datos futuros.
- `suppliers.rfc` queda bloqueado por decisión de catálogo, no por datos.
