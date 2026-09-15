# Tramo 6 · Análisis de unicidad de catálogos (solo inventario)

Base: commit 7922121afa3e464b06d9cdc11171cafd8726964d (8.8.23), RLS 51/51 y smoke SQL 45/45.
Este documento **no** propone aplicar migraciones, índices ni borrados. Ningún cambio se
ejecutó contra la base productiva; los índices se leyeron con consultas de solo lectura.

## 1. Inventario de unicidad vigente (leído de producción)

### 1.1 Ya acotado por organización (correcto)

| Tabla | Restricción / índice único |
| --- | --- |
| bookings | `(organization_id, booking_number)` |
| contracts | `(organization_id, contract_number)` |
| credit_notes | `(organization_id, credit_note_number)` |
| deliveries | `(organization_id, delivery_number)` |
| invoices | `(organization_id, invoice_number, coalesce(is_e2e,false))` |
| quotes | `(organization_id, quote_number, coalesce(is_e2e,false))` |
| feedback_reports | `(organization_id, folio)` **y además** `(folio)` global (heredado) |
| fiscal_periods | PK `(organization_id, period)` |
| organization_customers | PK `(organization_id, customer_id)` + `organization_customer_id` |
| organization_document_counters | PK `(organization_id, document_type)` |
| company_settings | `(organization_id)` parcial |
| billing_secrets | `(organization_id)` |
| invoice_number_settings | `(organization_id)` parcial |
| bank_accounts | un `is_default_collection` por `(organization_id)` |
| contract_templates | un `is_default` por `(organization_id)` |
| organization_memberships | `(organization_id, auth_user_id)` + `auth_user_id` global (una membresía por usuario, por diseño) |
| customer_portal_accounts | `auth_user_id` y `lower(email)` globales (por diseño: un correo = una empresa) |

### 1.2 Unicidad global sobre catálogos con `organization_id` (riesgo de choque entre empresas)

| Tabla | Índice único actual | `organization_id` |
| --- | --- | --- |
| forklifts | `(name)` y `(serial_number)`, ambos con `deleted_at IS NULL` | existe, nullable |
| mechanics | `(name)` | existe, nullable |
| drivers | `(name)` | existe, nullable |
| parts_inventory | `(sku)` | existe, nullable |
| suppliers | `(upper(btrim(rfc)))` con `deleted_at IS NULL` | existe, nullable |
| prospects | `(stage, stage_order)` | existe, nullable |
| payments | `(rep_number)` | vía factura |
| feedback_reports | `(folio)` global (además del par por organización) | existe |

### 1.3 Catálogos globales por diseño

| Tabla | Índice | Comentario |
| --- | --- | --- |
| customers | `(upper(rfc))` parcial | identidad global; lo comercial/fiscal vive en `organization_customers`. **Se conserva.** |
| equipment_models | `(lower(manufacturer), lower(model))` | catálogo compartido de modelos de equipo |
| role_permissions | `(role, module)` | catálogo de permisos |
| user_roles | `(user_id)` (un rol por usuario) | administración |
| organizations | `(slug)` | identidad de la empresa |

## 2. Naturaleza, clave natural y efecto de permitir el mismo valor en A y B

| Entidad | Naturaleza | Clave natural actual | Uso en código/RPC | Efecto de repetir el valor en A y B |
| --- | --- | --- | --- | --- |
| customers | identidad global | RFC normalizado | búsquedas por nombre/RFC, portal, validación fiscal | ninguno: el mismo cliente se comparte y cada empresa guarda lo suyo en `organization_customers` |
| organization_customers | relación por empresa | `(organization_id, customer_id)` | facturación recurrente, datos fiscales, portal | correcto hoy |
| equipment_models | catálogo compartido | fabricante + modelo | alta de flota | correcto, pero el error de duplicado no se traduce a un mensaje claro |
| forklifts | dato propio de empresa | nombre / número de serie | flota, rentas, mantenimiento, daños | hoy **bloquea** el alta: si A registró la serie, B recibe un error de duplicado sobre una unidad que ni siquiera puede ver |
| mechanics / drivers | dato propio de empresa | nombre | mantenimiento, entregas | hoy bloquea homónimos entre empresas |
| parts_inventory | dato propio de empresa | SKU | refacciones, mantenimiento | hoy bloquea el mismo SKU de fabricante en dos empresas |
| suppliers | dato propio de empresa (podría volverse identidad global) | RFC normalizado | CxP, pagos, REP de proveedor | hoy bloquea al mismo proveedor real en dos empresas |
| bank_accounts | dato propio de empresa | cuenta + banco (sin índice) | conciliación, cobranza | sin unicidad: riesgo de duplicados internos, no de cruce |
| contract_templates | dato propio de empresa | `is_default` por empresa | contratos y PDF | ya acotado; queda pendiente el filtro en las consultas (§3) |
| invoice_number_settings / fiscal_periods | dato propio de empresa | organización / periodo | folios y cierre fiscal | correcto |
| prospects | dato propio de empresa | `(stage, stage_order)` | tablero CRM | hoy dos empresas compiten por la misma posición del tablero |
| quotes | dato propio de empresa | folio por empresa | cotizaciones | correcto |
| payments.rep_number | dato propio de empresa | folio REP | complementos de pago | hoy el folio REP compite globalmente |

## 3. Consultas que dependen de unicidad frágil (sin tocar el esquema)

Propuesta: agregar filtro por la organización verificada del contexto de servidor,
nunca por un identificador enviado por el navegador.

| Lugar | Consulta | Riesgo | Corrección propuesta |
| --- | --- | --- | --- |
| `src/features/contracts/hooks/useContractTemplates.ts` (`useDefaultContractTemplate`) | `.eq("is_default", true).limit(1).maybeSingle()` | tomaría la plantilla de otra empresa | `.eq("organization_id", scope.organizationId)` y estado explícito si hay 0 o >1 |
| `src/lib/pdf/contract/fetchers.ts` | misma lectura de plantilla por `is_default` | PDF con plantilla ajena | resolver la plantilla desde la organización dueña del contrato |
| `src/features/system/hooks/useEntitySearch.ts` | `ilike` sobre `customers` por nombre/RFC | depende solo de RLS | unir con `organization_customers` de la empresa verificada |
| `src/features/fleet/hooks/useEquipmentModels.ts` | alta con clave natural compartida | error 23505 sin mensaje claro | traducir el duplicado a "ya existe en el catálogo compartido" |
| `src/features/suppliers/hooks/useSuppliers.ts` | alta por RFC | error de duplicado por un proveedor invisible | mensaje explícito hasta decidir la matriz (§4) |
| `src/features/maintenance/.../useMechanics.ts`, flota y refacciones | altas por nombre/serie/SKU | mismo bloqueo entre empresas | pendiente de la matriz; entretanto, mensaje claro |

No se encontraron `upsert(..., { onConflict })` sobre estos catálogos con claves naturales
compartidas: los `onConflict` existentes son por `user_id` y `(user_id, role)`.

## 4. Matriz de unicidad propuesta (para revisión, sin aplicar)

| Entidad | Propuesta | Justificación |
| --- | --- | --- |
| customers.rfc | **global** (sin cambio) | identidad global acordada |
| equipment_models | **global** (sin cambio) | catálogo compartido de modelos |
| organizations.slug, user_roles, role_permissions | **global** (sin cambio) | identidad y permisos |
| customer_portal_accounts.email / auth_user_id | **global** (sin cambio) | un correo = una empresa |
| forklifts.serial_number | **por organización** | la serie del fabricante puede repetirse entre empresas |
| forklifts.name | **por organización** | nomenclatura interna de cada empresa |
| mechanics.name, drivers.name | **por organización** | homónimos legítimos |
| parts_inventory.sku | **por organización** | catálogo de refacciones propio |
| suppliers.rfc | **decisión pendiente**: por organización, o replicar el patrón puente `organization_suppliers` | hoy es el único catálogo con RFC que no tiene tabla puente |
| prospects (stage, stage_order) | **por organización** | tablero por empresa |
| payments.rep_number | **por organización** | folio fiscal por empresa |
| feedback_reports.folio | retirar el índice global y conservar el par por organización | duplicado del par ya existente |
| bank_accounts (cuenta+banco) | **por organización** (nuevo, opcional) | evita duplicados internos |

## 5. Riesgos con datos históricos y estrategia ante duplicados

- Las filas con `organization_id` nulo harían un índice por organización menos estricto
  de lo esperado; antes de cualquier índice hay que confirmar que no existan nulos
  (hoy el backfill dejó 55/55 tablas con organización asignada).
- Estrategia para duplicados: (1) consulta de solo lectura que cuente colisiones por la
  clave propuesta; (2) si hay cero colisiones, el índice por organización es estrictamente
  más permisivo que el actual y no puede fallar; (3) si aparecen colisiones, se resuelven
  caso por caso con el área operativa antes de crear el índice.
- Con una sola empresa activa hoy, todo índice por organización es equivalente al actual:
  el momento de bajo riesgo para aplicarlo es **antes** de dar de alta la segunda empresa.

## 6. Plan de migración reversible (propuesto, no aprobado)

1. Conteo de colisiones por clave propuesta (solo lectura).
2. Migración por lotes pequeños: crear el índice nuevo `(organization_id, clave)` con
   `CONCURRENTLY` fuera de transacción cuando aplique, verificar y sólo después eliminar el
   índice global. Reversa: recrear el índice global y eliminar el nuevo.
3. Lote 1 (sin efecto fiscal): forklifts, mechanics, drivers, parts_inventory, prospects.
4. Lote 2 (fiscal/cobranza): payments.rep_number, feedback_reports.folio.
5. Lote 3 (decisión previa): suppliers.
6. Cada lote acompañado de pruebas RLS/smoke A/B desde base limpia.

## 7. Pruebas sugeridas (lectura / fixtures aislados)

- Fixture A/B de solo lectura que verifique qué índices únicos carecen de `organization_id`
  (falla si aparece uno nuevo en catálogos con empresa).
- Fixture que demuestre el bloqueo actual: A registra una unidad con cierta serie y el alta
  equivalente en B falla por duplicado, aun sin poder verla.

## 8. Decisiones que requieren aprobación humana

1. ¿`suppliers` pasa a ser por organización o adopta tabla puente?
2. ¿Se conserva `equipment_models` como catálogo compartido?
3. ¿Se retira el índice global de `feedback_reports.folio`?
4. ¿Se añade unicidad a `bank_accounts`?
5. Orden y ventana de los lotes antes de la segunda empresa.

## 9. Subtramo 6.1 · aplicación (versión 8.8.25)

Sin cambios de esquema, índices ni escrituras en producción:

- `useDefaultContractTemplate` y el PDF de contrato resuelven la plantilla por la
  organización verificada / la organización dueña del contrato, con estados explícitos
  de ausencia, ambigüedad y error de lectura (`contractTemplateResolution.ts`).
- `searchEntities` parte de `organization_customers` de la organización verificada y une
  `customers`, que sigue siendo identidad global; sin organización resuelta no consulta nada.
- Los choques de unicidad global de flota, mecánicos, operadores, refacciones, proveedores y
  modelos se traducen a mensajes seguros y accionables en `pgErrorCatalog.ts`.
- **Bloqueo documentado:** la unicidad real de esos catálogos sigue siendo global; retirarla
  exige la decisión de catálogo de §8 y una migración de índices, fuera del alcance de 6.1.
