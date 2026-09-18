# Storage histórico (multiempresa)

## Estado actual (2026-09-18)

> Este bloque es el **estado vigente**. Las secciones siguientes son
> **snapshots históricos fechados** de las auditorías previas y se conservan
> tal cual para trazabilidad: no describen la situación de hoy.

- Migraciones **0030–0035 aplicadas** a la base conectada por el canal oficial.
- **Operador raíz asignado** (exactamente 1 operador de plataforma); 5 membresías.
- **Migración de Storage completada**: 293 referencias actualizadas, 0 pendientes,
  0 fallos; 17 huérfanos copiados y verificados; **1 resolución manual activa**.
- **Originales conservados** (632 objetos = 322 originales + copias). El borrado
  de fuentes sigue **deshabilitado** y sin autorización.
- **1 sola organización activa**.
- **1 referencia de `company_settings.logo_url` fuera del Storage del proyecto,
  aún sin clasificar (2026-09-18)**: es una URL HTTPS de un host que no
  pertenece al Storage de este proyecto (no tiene forma
  `/storage/v1/object/...` ni prefijo de organización). No se publica su valor,
  host, ruta, token ni identificadores.
  - **No se concluye que sea la marca global.** Por sus usos reales,
    `company_settings.logo_url` es el **logo empresarial configurable**: lo
    consumen los documentos de la empresa (cotización, factura, contrato,
    estado de cuenta, vía `resolveIssuerBranding`) y la pantalla de
    Configuración. La navegación/sidebar ya no lo consume.
  - Por eso conserva **aislamiento por tenant**: se guarda como ruta bajo el
    prefijo de su organización y se resuelve firmando con la sesión actual
    (TTL 300 s); una empresa no puede mostrar el logo de otra. Las pruebas A/B
    aplican a este tipo de logo.
  - Mientras el valor no se clasifique, los documentos se generan **sin logo
    (fail-closed)**: no se descarga un host ajeno. Sustituirlo exige mutación de
    datos (volver a subir el logo desde Configuración) y **no está autorizado**.

### Marca global de LiftGo (no es dato de tenant)

La marca visible del producto —navegación, sidebar y encabezados de acceso— es
el **asset global de LiftGo del repositorio**, servido desde **fuente local
fija** e **idéntico para cualquier empresa**. No se lee de `company_settings`,
no se firma por organización, **no se traslada a Storage** y **no lleva gate ni
prueba A/B de aislamiento**: por diseño todos los tenants ven la misma marca.
La marca pública neutral sigue expuesta por `get_public_branding()`.

### Gates obligatorios antes de dar de alta una segunda empresa

1. **Logo empresarial resuelto y probado**: el logo de `company_settings` se
   sirve desde la organización del contexto y se firma con TTL corto, con
   prueba A/B de aislamiento. La **marca global de LiftGo** (asset del
   repositorio) queda **fuera de este gate**.
2. **Ensayo A/B aislado** (empresas de prueba) cubriendo datos, Storage y portal.
3. **CI completo en verde** (RLS, smoke SQL, Deno, tipos, lint, build).
4. **Recuperación verificada**: respaldo reciente **y restauración ensayada**
   documentada. Hoy hay respaldo diario, pero **no** hay restore ensayado.

---

# Snapshot histórico · Auditoría de solo lectura (2026-09-17, actualizado 2026-09-18)

Fecha del snapshot: 2026-09-17 · Estado **en ese momento**: propuesta documentada, nada ejecutado. Superado por el bloque "Estado actual" de arriba.

Fuente: informe `.lovable/plan.md` (commit `43d494d2a96225f86410888e3c71abdbddadaea9`) y verificaciones `SELECT` directas contra producción. Auditoría estrictamente de lectura: sin cambios de código, esquema, datos, policies, buckets ni objetos; sin DDL ni operaciones de Storage.

## 1. Buckets y objetos

Seis buckets, **todos privados**, confirmados por `SELECT` sobre `storage.buckets`:

| Bucket                    | Objetos | Bajo prefijo **exacto** de organización | Con otro UUID (no es prefijo de organización) | Sin forma UUID (legado real) |
| ------------------------- | ------- | --------------------------------------- | --------------------------------------------- | ---------------------------- |
| cfdi-files                | 173     | 0                                       | 163                                           | 10                           |
| supplier-bill-cfdi-xml    | 84      | 6                                       | 78                                            | 0                            |
| supplier-payment-receipts | 58      | 5                                       | 53                                            | 0                            |
| documents                 | 6       | 1                                       | 0                                             | 5                            |
| feedback-screenshots      | 1       | 0                                       | 1                                             | 0                            |
| payment-proofs            | 0       | 0                                       | 0                                             | 0                            |

**Total: 322 objetos**, de los cuales **sólo 12 están bajo el prefijo exacto de una organización conocida**; 295 empiezan con un UUID ajeno (factura, documento, usuario…) y 15 no tienen forma de UUID. Cifras de la reconciliación 2026-09-18 comparando cada primer segmento contra `public.organizations.id` (lectura, nada movido). Los inventarios previos (310 legados; «307 prefijados / 15 legados») están **desactualizados**: trataban cualquier UUID como prefijo de organización, y no lo es.

- **Un UUID cualquiera no cuenta como prefijo de organización**: `storage_prefix_organization()` (0022/0027) sólo reconoce el primer segmento si coincide exactamente con `public.organizations.id`. Por eso 295 objetos con UUID ajeno **no** están aislados.
- Los **15 objetos sin forma UUID** son el legado clásico (10 en `cfdi-files`, 5 en `documents`). **No atribuir el paso de 310 a 15 a un traslado**: no hay evidencia suficiente del linaje.
- **0 objetos en la raíz** de los buckets.
- **1 organización activa**; con una sola empresa no hay colisión posible. Al dar de alta la segunda, todo lo que no esté bajo prefijo exacto seguiría accesible a staff de ambas organizaciones.
- Bitácoras de migración (`storage_object_migrations`, `storage_reference_migrations`): **0 filas; nada iniciado**.
- **Reconciliación de rutas (no se muestran), reproducida con el código real** (`collectCandidates` + `REFERENCE_SPECS` + `parseStorageReference` + `makeStorageMigrationPlan`, y `summarizeStorageInventory`/`hasOrganizationStoragePrefix`): **305 filas de referencia** = 293 candidatas + 11 ya prefijadas + 1 no soportada; las 304 filas interpretables dan **304 rutas distintas**, todas existentes en Storage. Por cubeta: `cfdi-files` 173 candidatas / 0 ya prefijadas; `documents` 5 / 1 (+1 URL de logo no soportada); `feedback-screenshots` 1 / 0; `supplier-bill-cfdi-xml` 62 / 5; `supplier-payment-receipts` 52 / 5.
- **18 objetos sin referencia**: 17 **sin prefijo de organización** (16 en `supplier-bill-cfdi-xml`, 1 en `supplier-payment-receipts`) y **1 ya prefijado** (`supplier-bill-cfdi-xml`). 304 referenciados + 18 sin referencia = 322.

- **Formatos:** 56 referencias a `supplier_bills.cfdi_xml_url` y 43 a `supplier_payments.receipt_url` son **signed URLs con token**, compatibles con el parser actual del migrador; todos los objetos de esas referencias coinciden. 1 referencia `company_settings.logo_url` es **HTTPS** sin forma de ruta `/storage/v1/object/...`; eso **no basta para clasificar el host** ni para afirmar que el navegador la rechaza. Requiere clasificación manual y **prueba conductual por organización**; no se muestra su valor/host/ruta/token. Para las demás referencias especificadas, la lectura agregada encontró **0 sin coincidencia**. La consulta previa que reportó «0 URLs» estaba desactualizada.

## 2. Policies y helpers

- **25 policies en `storage.objects`** (conteo corregido; un conteo previo reportó 26 por duplicar una fila): **8 de SELECT y 17 de INSERT/UPDATE/DELETE**, según `SELECT * FROM pg_policies WHERE schemaname='storage' AND tablename='objects'`.
- Helpers de aislamiento confirmados en producción: `current_organization_id()`, `storage_prefix_organization`, `storage_path_in_current_organization`, `invoice_in_current_organization` (definidos en `drizzle/migrations/0022_storage_tenant_scoped_policies.sql:20-80`).

## 3. Convenciones de rutas y handlers

- Ruta nueva obligatoria: `<organization_id>/<path>` (`supabase/functions/_shared/storagePath.ts:21-48`, espejo en `src/lib/storage/organizationPath`).
- Rutas legadas sin prefijo: 0021/0022 solo permiten leerlas/borrarlas, nunca crear rutas cruzadas.
- Escritura privilegiada con organización derivada del registro (no del navegador): `stamp-cfdi/handler.ts:674`, `stamp-credit-note/handler.ts:550,578`, `stamp-payment-complement/handler.ts:565,583`, `validate-supplier-rep/index.ts:266,286`, `reconcile-stamping-invoices/index.ts:498,527,754,777,1013,1036`.
- Server function de proveedor: `src/lib/supplierRep.functions.ts:167,182`.
- Cliente: `src/hooks/useDocuments.ts:50,76,104`; `src/lib/storage/openStorageFile.ts` firma URLs de 60 s.
- **Conducta real de `openStoredFile` (`openStorageFile.ts:94-115`):** las URLs persistidas **no se abren tal cual**. Si la URL apunta al Storage del propio proyecto, se extraen bucket y ruta y se **re-firma con la sesión actual y TTL corto** (60 s), de modo que las policies vigentes (incluido el alcance por organización) aplican hoy, no cuando se generó el enlace; cualquier otra URL se **rechaza (fail-closed)** en lugar de abrirse (`parseStorageUrl`, `openStorageFile.ts:40-86`). No hay bypass de re-derivación de organización para esa vía: el enlace congelado se sustituye por uno de corta duración sujeto a RLS. **Pero `company_settings.logo_url` no pasa solo por `openStoredFile`:** también se renderiza directamente con `<img src={logoUrl}>` en `src/layouts/sidebar/SidebarBranding.tsx`, `src/features/operations/components/operations/CompanyLogoTab.tsx` y `src/components/BrandMark.tsx`, y el helper de PDF `src/lib/pdf/assets/logo.ts` hace `fetch(url)` directo; esos caminos **no** aplican el re-firmado ni el fail-closed del parser. La lectura segura de producción halló **una sola referencia HTTPS**, sin forma de ruta `/storage/v1/object/...`; eso **no basta para clasificar el host** ni para afirmar que el navegador la rechaza. La **clasificación manual y la prueba conductual por organización siguen pendientes**. **No confundir** con la marca pública preautenticada, que usa `get_public_branding()` neutral de LiftGo, no el logo organizacional. En producción, `pg_policies` muestra `org_scope_isolation` como **RESTRICTIVE** y las policies de rol como **PERMISSIVE**, todas para `authenticated`. No se muestra valor/host/ruta/token.
- Migrador administrativo ya escrito y **sin ejecutar**: `supabase/functions/migrate-storage-org-prefix/index.ts`. El modo `apply` **no borra**: inventaría → copia → **compara tamaño y SHA-256 de los bytes de fuente y copia** (`_shared/storageCopyVerification.ts`, aplicado también cuando el destino ya existía de un intento previo) → actualiza referencias con guarda de hash del valor y de organización, y deja **todas las fuentes intactas** (estado final del ledger: `references_updated`; `source_deleted` nunca se marca en apply). Si la comparación falla, el objeto queda en `failed` con código agregado (`source_missing`, `destination_missing`, `copy_size_mismatch`, `copy_digest_mismatch`) y **no** se toca ninguna referencia. Barreras de apply: auth cron/service, `STORAGE_MIGRATION_APPLY_ENABLED`, confirmación `COPY_UPDATE_VERIFY_NO_DELETE`.

## 4. Plan propuesto de migración de históricos (no autorizado, no ejecutado)

1. **Inventario**: migrador en modo plan; ledger con `source_path`/`destination_path` y SHA-256. Parar si aparece un objeto sin organización derivable.
2. **Copia (staging)**: copiar a `<organization_id>/<ruta_actual>` sin borrar el origen. Rollback = borrar la copia.
3. **Verificación A/B**: comparar tamaño y hash origen/destino objeto por objeto; contrastar conteos por bucket antes/después.
4. **Actualización de referencias por lote**: por tabla/columna del `REFERENCE_SPECS`, con rollback por SHA-256 guardado.
5. **Doble lectura y observación**: la app intenta primero la ruta con prefijo y cae a la legada, hasta que el 100 % del ledger esté en `references_updated`.
6. **Borrado del origen**: fase **separada** (`mode: "delete_sources"`), posterior a la ventana de observación y **solo con autorización explícita**. Irreversible.

### Fase 6 — borrado de fuentes (implementada, desactivada por defecto)

Modo dedicado `delete_sources` en el mismo endpoint, independiente de `apply`:

- **Bandera de entorno propia:** `STORAGE_MIGRATION_DELETE_SOURCES_ENABLED` (distinta de la de apply; **no** está configurada, así que responde 403 `source_deletion_disabled`).
- **Confirmación textual distinta:** `DELETE_MIGRATED_SOURCES_AFTER_VERIFY`.
- **Inventario completo obligatorio**; si está truncado responde 409.
- **Verificación previa objeto por objeto** (`supabase/functions/_shared/storageDeletePhase.ts`): sólo objetos `discovery_kind = 'referenced'` en estado `references_updated`, con al menos una referencia, todas en estado `updated`, con `organization_id` coincidente y con el **valor actual igual al valor de destino**, y con el **destino verificado como existente** en Storage. Cualquier desvío deja el objeto en `blocked` con código de causa y **no** borra nada.
- **Revalidación de bytes justo antes de remover:** se vuelven a descargar fuente y copia y se exige **igual tamaño e igual SHA-256**. Un estado previo del ledger (`copied` o `references_updated`) **no** exime de esta prueba; si falla, el objeto queda `blocked` con el código de la discrepancia y la fuente permanece.
- **Huérfanos: nunca.** El modo de huérfanos (`apply_orphans`) sólo copia y verifica; `deleteEligibility` devuelve `orphans_never_deleted` para cualquier objeto sin referencia, en cualquier modo.

**Condiciones de parada (antes del borrado):** cualquier diferencia de hash/tamaño, un objeto huérfano sin referencia, un error de permisos, o la existencia de la segunda empresa sin ensayo previo en entorno aislado.

**Rollback:** mientras no se borre el origen, basta borrar las copias y revertir las referencias usando el SHA-256 del ledger. Como apply ya no borra, el rollback sigue disponible durante toda la fase de copia y actualización.

**Estado real de los ledgers (2026-09-18):** `storage_object_migrations` y `storage_reference_migrations` siguen en **0 filas**; **ningún objeto se ha copiado, ninguna referencia se ha actualizado y ninguna fuente se ha borrado**. Los 15 objetos legados reales (10 en `cfdi-files`, 5 en `documents`) siguen sin prefijo y están referenciados: su dueño **sí** puede derivarse de la referencia, pero sólo pueden reubicarse por el flujo protegido copy → verify → update references → observe → delete, aún no autorizado ni ejecutado.

### Condición de parada de `apply` frente a objetos sin referencia

La reconciliación del 2026-09-18, reproducida con el código real (`collectCandidates`, `REFERENCE_SPECS`, `parseStorageReference`/`makeStorageMigrationPlan`, `summarizeStorageInventory`/`hasOrganizationStoragePrefix`) y comparando contra **todas** las filas de `public.organizations`, dio 322 objetos: 304 referenciados y **18 sin referencia**, de los cuales **17 no tienen prefijo de organización** (16 en `supplier-bill-cfdi-xml`, 1 en `supplier-payment-receipts`) y **1 sí lo tiene**. Sólo **12 objetos** de los 322 están bajo prefijo exacto de organización.

Por eso `apply` no se detiene por el total de objetos sin referencia, sino sólo por los **sin referencia y sin prefijo** (`unreferenced_unscoped_objects`). Con el estado actual, esos **17 huérfanos mantienen `apply` bloqueado** — no porque carezcan de dueño, sino porque el gate cuenta `unreferenced_unscoped_objects` sin usar la atribución: **16 de ellos sí tienen dueño derivable** (15 por `supplier_bills.cfdi_uuid` en `supplier-bill-cfdi-xml`, 1 por `supplier_bills.id` en `supplier-payment-receipts`; ver §Atribución) y **1 sigue sin coincidencia**. Los 16 requieren copia + verificación y contención de su fuente; el restante, decisión de dueño. El resumen reporta ambos conteos, globales y por cubeta:

- `unreferenced_scoped_objects`: sin referencia pero ya aislados (hoy **1**). **No bloquean**, no entran al ledger, no se vuelven a copiar y nunca se borran.
- `unreferenced_unscoped_objects`: sin referencia y sin prefijo (hoy **17**). **Bloquean `apply`** con 409 `Resolve unscoped unreferenced Storage objects before apply.`

Un objeto se considera aislado sólo si su primer segmento coincide exactamente con el identificador de una organización **conocida**; un UUID cualquiera (por ejemplo el de una factura o un documento) **no** cuenta como prefijo. `apply_orphans` y `delete_sources` siguen sin ejecutarse, el borrado de fuentes sigue en fase separada y deshabilitado por bandera, y el borrado de huérfanos sigue prohibido por diseño.

### Atribución determinista de huérfanos (2026-09-18)

Auditoría de sólo lectura sobre los **17** objetos sin referencia y sin prefijo, usando los puntos de subida reales:

- `supplier-bill-cfdi-xml` (`useUploadSupplierBillXml`): el primer segmento histórico es el **UUID fiscal del CFDI**. De los 16 huérfanos, **15 coinciden con exactamente una fila de `supplier_bills.cfdi_uuid`** y su organización; **1 no coincide con ninguna**.
- `supplier-payment-receipts` (`useUploadSupplierReceipt`): el primer segmento histórico es el **id de la factura de proveedor** (`billId`). El único huérfano **coincide con exactamente una fila de `supplier_bills.id`** y su organización.

Total: **16 de 17 tienen dueño derivable; 1 sigue sin coincidencia.** Ninguno tiene referencias.

Reglas del resolvedor (`supabase/functions/_shared/storageOrphanOwner.ts`, puro y con pruebas):

- Sólo coincidencia **exacta** de la clave del call-site con **una única** fila dueña y una organización **conocida**.
- Cero coincidencias, varias filas dueñas o varias organizaciones ⇒ `unresolved`/`conflict`, **sin asignación** y **fuera del ledger**.
- Nunca se deduce la organización por la forma del UUID, por ser la única empresa existente, ni por nombre de archivo o fecha.
- Otros buckets no tienen método soportado (`unsupported_bucket`).
- Se **eliminó** el atajo previo que, habiendo una sola organización, asignaba todos los huérfanos a ella.

**Lectura acotada y fail-closed del índice de dueños (8.14.1):** no se lee la tabla completa de facturas de proveedor. Primero se derivan las claves de los objetos sin referencia y sin prefijo, luego se consultan **sólo** esas filas con filtros estructurados `.in(cfdi_uuid, …)` / `.in(id, …)` en bloques de 100, paginando hasta agotar (páginas de 500) y detectando explícitamente truncación, error o duplicación anómala. Si la lectura de una clave no se agotó, esa clave **no** se marca completa y resuelve `incomplete_lookup`: sin dueño, sin candidato y sin ledger. `delete_sources` no carga este índice y sus comprobaciones quedan intactas.

**Normalización de mayúsculas del UUID fiscal (8.14.2):** `supplier_bills.cfdi_uuid` es `text` y en producción convive en mayúsculas (67 filas) y minúsculas (2; 0 mixtas) sobre 69 valores no nulos, mientras que la clave derivada del path se normaliza a minúsculas. El filtro `.in(cfdi_uuid, …)` distinguía mayúsculas y producía falsos negativos. Ahora la búsqueda de `cfdi_uuid` es exacta pero **insensible a mayúsculas**: `ilike` **sin comodines**, aplicado sólo a claves ya validadas como UUID (no pueden contener `%`, `_`, `,` ni comillas) y siempre acotado a las claves derivadas de los huérfanos. `supplier_bills.id` es `uuid` y conserva `.in(...)`. La indexación normaliza a minúsculas antes de resolver, conservando la detección de filas duplicadas y de múltiples organizaciones. Verificación de sólo lectura sobre el dataset actual: los conteos **no cambian** — 15 coincidencias únicas por UUID fiscal, 1 sin coincidencia y 1 comprobante con coincidencia única por `supplier_bills.id`; 0 duplicados.

**Por qué no se amplió el esquema del ledger:** el método de atribución queda determinado por `bucket_id` (`supplier-bill-cfdi-xml` ⇒ `supplier_bill_cfdi_uuid`; `supplier-payment-receipts` ⇒ `supplier_bill_id`) y sólo se insertan filas con dueño único resuelto. Una columna `owner_resolution_method` sería redundante y obligaría a persistir evidencia derivada del UUID fiscal, que no debe guardarse como contenido de reporte. El método queda documentado aquí y en el tipo `OrphanOwnerResolutionMethod`.

**Sin relajar nada:** `apply` sigue bloqueado mientras exista cualquier objeto sin referencia y sin prefijo exacto (hoy 17). `apply_orphans` sólo puede preparar los de dueño único, en copia + verificación, sin tocar referencias ni borrar la fuente, y reporta aparte el que no tiene dueño. Las fuentes sin prefijo siguen compartidas: **el alta de una segunda empresa sigue bloqueada** hasta contenerlas mediante el borrado separado, que continúa deshabilitado. Los 15 históricos **referenciados** son un tema distinto.

## 5. Dependencia operativa REP (precondición crítica de despliegue)

- Producción **no tiene** `public.is_internal_member(uuid)` ni `public.user_in_current_organization(uuid)`.
- `drizzle/migrations/0025_*.sql` define `is_internal_member`; `drizzle/migrations/0026_rep_number_org_scoped_assignment.sql` la **invoca**.
- Por tanto, **0026 sola no está lista para producción**: hay que comprobar qué migraciones de la cadena 0021–0025 faltan en producción y aplicarlas **en orden** (incluida 0025), o hacer 0026 autocontenida.
- Antes de cerrar el tramo 8.1 se exige smoke en entorno aislado con **ambos** casos: ejecución de la firma estricta como usuario interno **autenticado** y ejecución del wrapper como **service_role**.

## 6. Cobertura y pendientes

Cubierto para archivos **nuevos**: prefijo de organización obligatorio, policies tenant-aware, helpers `SECURITY DEFINER`, prueba RLS `supabase/tests/rls/storage_org_prefix.sql`.

Pendiente para **históricos**: sólo **12 de 322 objetos** están bajo prefijo exacto de organización. Los **15 objetos legados referenciados** siguen sin prefijo (10 en `cfdi-files`, 5 en `documents`) y pueden asignarse desde sus referencias, pero sólo mediante el flujo protegido; además **17 huérfanos mantienen `apply` bloqueado** (el gate cuenta `unreferenced_unscoped_objects` sin usar la atribución): **16 tienen dueño derivable** que requieren copia + verificación y contención de su fuente, y **1 sigue sin coincidencia** y requiere decisión de dueño. La doble lectura y el traslado **no están autorizados ni ejecutados**.

Decisiones aún pendientes:

- Catálogos: `suppliers`, `equipment_models`, `bank_accounts`.
- Autorización y secuencia 0025→0026 en producción + despliegue de Edge Functions.
- **Ensayo con dos organizaciones en entorno aislado — requisito previo e indispensable antes del alta real de otra empresa.**
- Ventana de alta de la segunda empresa (solo después del ensayo y de cerrar el bypass del folio REP).

## Actualización 8.9.0 — cierre del riesgo entre empresas (repositorio, no aplicado en producción)

La auditoría previa se limitó a los objetos históricos. Al escribir la prueba A/B
con dos organizaciones aparecieron huecos **en las policies vigentes**, no sólo en
las rutas antiguas:

| Bucket                      | Policies sin alcance por organización (antes de 0027)                           |
| --------------------------- | ------------------------------------------------------------------------------- |
| `documents`                 | `Staff upload documents`, `Staff update documents`, `Staff delete documents`    |
| `documents` (portal)        | `Customers read own scoped documents` → resolvía por `customer_id` global       |
| `feedback-screenshots`      | `Admins read all feedback screenshots`, `Admins delete any feedback screenshot` |
| `cfdi-files`                | lectura, alta, reemplazo y borrado por admin                                    |
| `supplier-payment-receipts` | las 4 policies                                                                  |
| `supplier-bill-cfdi-xml`    | lectura de staff + alta/reemplazo/borrado                                       |

`drizzle/migrations/0027_storage_tenant_scope_remaining_buckets.sql` las reescribe
con el mismo criterio de 0022 (`storage_path_in_current_organization`):
INSERT exige prefijo propio; UPDATE tolera legado en `USING` pero exige prefijo
propio en `WITH CHECK` (un objeto no puede moverse al prefijo ajeno);
SELECT/DELETE toleran legado y rechazan prefijo ajeno. Además
`customer_can_read_document_object` queda acotada a
`documents.organization_id = current_organization_id()`.

Cliente: `src/lib/storage/openStorageFile.ts` ya no abre URLs `http(s)` persistidas
tal cual (una URL firmada a 5 años es un permiso congelado que ignora las policies
actuales). Si la URL apunta al Storage del proyecto se re-firma con la sesión
actual y TTL de 60 s; cualquier otra URL se rechaza (fail-closed).

Cobertura: `supabase/tests/rls/storage_cross_org_ab.sql` (A/B con dos
organizaciones, admin de A, admin de B como guard positivo y cuenta de portal del
mismo cliente global) y `src/lib/storage/__tests__/openStorageFile.test.ts`.

Riesgo residual **no cerrado por 0027**: los 310 objetos legados sin prefijo no
llevan organización, así que el staff de cualquier organización los seguirá
leyendo. Sólo el traslado descrito arriba lo cierra; por eso sigue siendo
precondición del alta de la segunda empresa.

## Actualización 8.10.0 — correcciones tras la revisión de CI (repositorio, nada aplicado)

La corrida `35177145738` del workflow _RLS DB tests_ terminó **52/54**. Errores originales:

1. `supabase/tests/rls/storage_cross_org_ab.sql:222` — `RLS BREACH: la sesión de la ORG A borró objetos de la ORG B`. **Falso positivo de la prueba**: el fixture crea **cinco** objetos con prefijo de la ORG B (uno por bucket) y la aserción exigía `count <> 4`.
2. `supabase/tests/rls/storage_objects_documents.sql:93` — el positivo del portal veía 0 objetos. La prueba heredada no asignaba `organization_id` a `documents`/`invoices` ni creaba `organization_memberships`, y `current_organization_id()` (0025) se deriva de esa tabla; el helper acotado por 0027 quedaba, correctamente, cerrado.

Correcciones (sin relajar helper ni RLS):

- `storage_cross_org_ab.sql`: conteo corregido a **5** y verificación **por bucket** (el total ya no puede compensarse); membresía `member_type='portal'` para la cuenta de portal de la ORG A.
- `storage_objects_documents.sql`: fixture reescrito como A/B sintético — organizaciones A y B, membresías internas y de portal, `documents`/`invoices` ligados a su organización, rutas nuevas con prefijo, un documento de la ORG B con ruta nueva y otro legado. Se conservan los positivos propios (cliente ve su archivo exacto, mecánico ve `forklift/`, ventas sube y no borra) y se añaden negativos cruzados.

### Límite del legado: lo que 0027 sí cierra y lo que no

`storage_path_in_current_organization(..., false)` admite las rutas sin prefijo, así que **por sí sola** dejaría el legado accesible a cualquier staff. Para el bucket `documents` existe una forma segura de resolver el propietario sin inventar datos ni mover objetos: la fila `public.documents` que referencia la ruta ya tiene `organization_id`. 0027 añade
`public.storage_document_owned_by_other_organization(text)` y la exige en las policies de lectura, reemplazo y borrado de staff en `documents`. Los huérfanos históricos (ruta sin fila que la reclame) conservan el comportamiento actual.

**No queda cerrado** en `cfdi-files`, `supplier-payment-receipts`, `supplier-bill-cfdi-xml` y `feedback-screenshots`: no hay columna que ligue la ruta legada con su organización, así que el staff de una futura segunda empresa **también podría leer o borrar esos objetos históricos**. La prueba A/B incluye una **aserción-gate explícita** (`GATE DESACTUALIZADO: …`) que falla si ese supuesto cambia, para que nadie documente el riesgo como cerrado por error.

**Conclusión de alcance:** 0027 aísla las **rutas nuevas con prefijo** y el legado del bucket `documents`; el **legado del resto de buckets sigue compartido**. El alta de la segunda empresa continúa **bloqueada** hasta que la migración de objetos históricos esté probada y ejecutada por su canal autorizado.

### Apertura de archivos: auditoría de call-sites

Call-sites actuales: `openStoredFile` sólo en `SupplierPaymentRow` (`receipt_url` de `supplier-payment-receipts`); `openStorageFile` (path directo) en `PaymentIntentsSection` (`payment-proofs`) y `SupplierPaymentRepReceived` (`rep_xml_url`/`rep_pdf_url`). Los hooks de subida (`useUploadSupplierReceipt`, `useUploadSupplierBillXml`) y `useDocuments` persisten **paths**, no URLs. La auditoría previa confirmó **0 referencias http en base**, así que rechazar hosts externos no rompe ninguna ruta soportada. Se añadió además el caso de URL mal formada o con separador codificado (`%2E%2E%2F`, porcentaje inválido), que falla cerrado sin excepción no controlada.

## Actualización 8.10.3 — evidencia final de CI (confirmado en GitHub Actions)

El commit `45c9293fe9ef844092772ca588728c4d8a7ce13d` cerró la verificación
automática del tramo de Storage:

| Workflow     | Run              | Resultado          |
| ------------ | ---------------- | ------------------ |
| RLS DB tests | 35180736054      | **54/54 en verde** |
| CI principal | 35180736071      | en verde           |
| Gitleaks     | 35180736167      | en verde           |
| Smoke SQL    | (incluido en CI) | **45/45 en verde** |

### Alcance confirmado (sin cambios respecto a 8.10.0)

- **Rutas nuevas con prefijo `<organization_id>/`**: aisladas entre organizaciones en los cinco buckets. La empresa A no puede ver, listar, reemplazar ni borrar objetos de la empresa B.
- **Legado de `documents` sin prefijo**: aislado por empresa cuando la fila dueña (`public.documents.organization_id`) identifica la organización; los huérfanos sin ficha conservan el comportamiento actual.
- **Legado de `cfdi-files`, `supplier-payment-receipts`, `supplier-bill-cfdi-xml` y `feedback-screenshots`**: sigue **compartido** entre organizaciones porque no existe columna que ligue la ruta histórica con su empresa. El riesgo **no se cerró**.
- **Huérfanos** (ruta sin fila que la reclame): conservan el comportamiento actual.

### Bloqueo del alta de la segunda empresa

El alta de una segunda empresa permanece **bloqueada** hasta que los **15 objetos históricos sin prefijo** (10 en `cfdi-files`, 5 en `documents`) se migren a rutas con prefijo de organización, probadas y ejecutadas por su canal autorizado (migrador administrativo `migrate-storage-org-prefix`). Las migraciones 0026 y 0027 siguen **sin aplicar** en producción.

## Re-inventario 2026-09-17 (solo lectura · nada movido)

La sección 1 refleja la lectura `SELECT` del 2026-09-17 y **supera** el inventario previo (310 legados / 0 URLs), desactualizado. **Nada de esto movió objetos ni actualizó referencias**; las dos bitácoras siguen con **0 filas**. El procedimiento copy → verify → update references → observe → delete source se conserva íntegro, con borrado **separado y no ejecutado**; la herramienta de plan/apply mantiene sus gates (auth cron/service, `STORAGE_MIGRATION_APPLY_ENABLED`, confirmación textual).

### Implicación para el riesgo residual

Con 0 legados en `supplier-bill-cfdi-xml`, `supplier-payment-receipts` y `feedback-screenshots`, el riesgo de legado compartido se concentra hoy en **`cfdi-files` (10)** y **`documents` (5)**. El bloqueo del alta de la segunda empresa se mantiene: esos 15 legados siguen accesibles a staff de cualquier organización y requieren prefijo + actualización de referencias probados por el canal autorizado.

## Corrección 2026-09-18 — sólo 12 objetos están realmente aislados (solo lectura)

Las cifras «307 prefijados / 15 legados» quedan **retiradas**: contaban como prefijo cualquier primer segmento con forma de UUID. Comparando contra `public.organizations.id`, **sólo 12 de 322 objetos** están bajo prefijo exacto de organización (1 en `documents`, 6 en `supplier-bill-cfdi-xml`, 5 en `supplier-payment-receipts`); 295 llevan un UUID ajeno y 15 no tienen forma UUID.

Reproducción con el código real: 305 filas de referencia = **293 candidatas** + **11 ya prefijadas** + **1 URL de logo no soportada**; 304 rutas distintas, todas existentes. Objetos sin referencia: **18 = 17 sin prefijo + 1 con prefijo**. Las sumas cierran contra los 322 objetos y contra el `SELECT` de prefijos exactos.

Consecuencia operativa: los **17 huérfanos bloquean `apply`** — el gate cuenta `unreferenced_unscoped_objects` sin usar la atribución; de esos 17, **16 tienen dueño derivable** (15 por `supplier_bills.cfdi_uuid`, 1 por `supplier_bills.id`) que requieren copia + verificación y contención de su fuente, y **1 sigue sin coincidencia** y requiere decisión de dueño. Los **15 legados reales referenciados** sí pueden asignarse desde sus referencias, pero únicamente por el flujo protegido copy → verify → update references → observe → delete. El borrado de fuentes sigue en **fase separada y deshabilitado** (`STORAGE_MIGRATION_DELETE_SOURCES_ENABLED` sin configurar). **Cero operaciones de Storage ejecutadas en producción**: ambos ledgers en 0 filas, ninguna copia, ninguna referencia actualizada, ningún borrado.

## Endurecimiento 0031 (tramo 10) — Storage estricto y cuarentena (repositorio, nada aplicado)

Fecha: 2026-09-19 · Estado: **dry-run; ninguna operación en producción**.

### Qué cambia en las reglas de acceso

- `storage_path_in_current_organization(text, boolean)` **ignora** el parámetro
  de compatibilidad: siempre exige que el primer segmento sea exactamente el
  `organizations.id` de la empresa del usuario **y que esa empresa esté activa**.
  Desaparece la variante permisiva que aceptaba rutas sin prefijo o con un UUID
  ajeno en lectura, actualización y borrado.
- Se añade una policy **RESTRICTIVE** (`storage_objects_org_prefix_guard`) para
  todas las operaciones de `authenticated`: ninguna policy permisiva antigua
  puede saltarse el prefijo ni la verificación de empresa activa.
- Una **empresa suspendida** pierde también el acceso directo por la Storage API.
- `service_role` conserva el acceso privilegiado que necesita el migrador.

**Consecuencia operativa:** los 15 objetos legados sin prefijo y los 295 con un
UUID ajeno dejan de ser accesibles desde una sesión autenticada. El traslado
histórico pasa a ser **requisito previo** al alta de la segunda empresa, y
también al uso normal de esos archivos por el personal.

### Proceso forward-only, reproducible y con dry-run

Orden invariable: **copy → verify → update references → observe → delete**.

1. `plan` (solo lectura): inventario completo y agregados; nunca muestra rutas,
   URLs, identificadores ni tokens.
2. `apply`: copia, verifica tamaño y SHA-256 del destino y actualiza las
   referencias usando el `organization_id` **del registro dueño**. Nunca borra.
3. `delete_sources`: fase separada, apagada por omisión
   (`STORAGE_MIGRATION_DELETE_SOURCES_ENABLED` + confirmación textual), con
   reverificación de integridad justo antes de remover.

### Cuarentena: nada se adivina

`supabase/functions/_shared/storageQuarantine.ts` resume, **sólo en conteos**
por cubeta y motivo, todo objeto que **no** tiene dueño único y verificable:

| Motivo                 | Significado                                |
| ---------------------- | ------------------------------------------ |
| `owner_not_found`      | ningún registro dueño coincide             |
| `owner_conflict`       | más de un registro o más de una empresa    |
| `unknown_organization` | el dueño apunta a una empresa desconocida  |
| `incomplete_lookup`    | la lectura no se agotó: falla cerrado      |
| `unsupported_bucket`   | la cubeta no tiene relación dueña definida |
| `invalid_path`         | la ruta no es interpretable                |

Estos objetos **quedan denegados y en lista de resolución manual**: no se copian,
no se referencian y jamás se borran. El resumen del modo `plan` expone el campo
`orphans.quarantine` con esos agregados.

### Estado actual del inventario (sin cambios)

322 objetos; 12 con prefijo exacto; 18 sin referencia = 17 sin prefijo + 1 con
prefijo. De los 17, **16 tienen dueño exacto derivable** (15 por
`supplier_bills.cfdi_uuid`, 1 por `supplier_bills.id`) y **1 sigue sin
coincidencia** (queda en cuarentena). El `apply` normal **sigue bloqueado** por
los 17. Ambas bitácoras siguen en **0 filas**.

## Actualización 8.17.0 — las operaciones de personal exigen membresía interna (0032)

**Hallazgo (revisión del commit `9472ecf`).** `storage_path_in_current_organization()`
se apoya en `current_active_organization_id()`, que acepta **cualquier** tipo de
membresía, incluida `portal`. Como varias policies de Storage conceden por **rol
global** (`admin`, `administrativo`, `auditor`, `dispatcher`, `ventas`,
`mechanic`), una cuenta de portal con un rol interno **residual** podía leer,
reemplazar o borrar archivos del **personal de su propia empresa**, aunque el
prefijo ya estuviera aislado **entre** empresas.

**Cierre (`drizzle/migrations/0032_multi_org_storage_staff_scope.sql`, journal
idx 32, forward-only).** Nuevo predicado
`public.storage_staff_path_in_current_organization(text, boolean)`:

- exige `current_internal_organization_id()` — membresía `internal` **única** en
  empresa **activa**, y `NULL` si el usuario tiene **cualquier** membresía de
  portal;
- exige prefijo **exacto** de esa organización (`storage_prefix_organization`);
- fail-closed: sin membresía interna no autoriza nada, pase lo que pase con el
  rol global.
- ACL: `REVOKE` a `PUBLIC`/`anon`, `GRANT EXECUTE` sólo a `authenticated` y
  `service_role`.

Se reescribieron con ese predicado **todas** las ramas de personal:

| Bucket                      | Policies reescritas                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `documents`                 | `Staff read/upload/update/delete documents`                                                       |
| `cfdi-files`                | `Admins can read/write/update/delete cfdi-files`                                                  |
| `supplier-bill-cfdi-xml`    | `Staff read` + `Admin/Administrativo insert/update/delete`                                        |
| `supplier-payment-receipts` | `Receipts read/insert/update/delete`                                                              |
| `feedback-screenshots`      | `Admins read all` / `Admins delete any`                                                           |
| `payment-proofs`            | rama administrativa dentro de `Customers read own proofs` y `Customers delete own pending proofs` |

**Lo que NO cambió.** Las policies de **objeto propio del portal** conservan su
alcance exacto: `payment_proof_path_allowed` (comprobantes del propio cliente),
`customer_can_read_document_object` (documentos propios) y las capturas propias
por usuario en `feedback-screenshots`. El guard transversal RESTRICTIVE
`storage_objects_org_prefix_guard` (prefijo exacto + empresa activa) sigue
vigente y no se relajó. No se movió ningún objeto ni se tocó producción.

**Verificación fail-closed dentro de la propia migración:** un bloque final
recorre las 20 policies afectadas y aborta si alguna falta o no invoca el
predicado de personal.

**Regresión** (`supabase/tests/rls/storage_strict_org_prefix_0031.sql`, bloques
6 y 7): cuenta de portal con rol `admin` residual en la misma empresa —
`SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre archivos del personal denegados y
sin efecto real; conserva la lectura de **su propio** comprobante de pago; y
ninguna policy que conceda por rol interno puede quedar sin el predicado de
personal. Verificación local: **61/61 suites RLS en verde** contra la instancia
PostgreSQL efímera (588 migraciones Supabase + 33 Drizzle). La validación
completa corresponde a CI.

## Actualización 8.19.0 — cierre operativo de la cuarentena (0034)

Hasta aquí el modo `plan` decía **cuántos** objetos exigen decisión humana, pero
no **cómo** decidir el dueño de un objeto sin coincidencia. Este tramo cierra ese
hueco sin relajar nada.

### 1. La respuesta normal sigue siendo agregada

El modo `plan` (y cualquier otra respuesta del endpoint) devuelve **sólo
conteos**: `orphans.quarantine` por cubeta y motivo, y
`orphans.manual_resolution = { accepted, rejected }`. Nunca se devuelven ni se
registran en logs rutas, URLs firmadas, tokens ni identificadores de objeto o de
fila. La prueba
`supabase/functions/_shared/storageQuarantine_test.ts` fija ese contrato y
verifica que evaluar la cuarentena es **puro**: no copia, no actualiza
referencias y no borra.

### 2. Procedimiento de inspección de sólo lectura (operador autorizado)

Este procedimiento **no se ejecuta desde la aplicación ni desde el endpoint**.
Lo corre una persona autorizada, con credencial `service_role`, en un entorno
privado (consola SQL controlada, sesión no compartida, sin volcar resultados a
tickets ni a chats). Es estrictamente de **lectura**.

1. Obtener del modo `plan` únicamente los **conteos** de cuarentena por cubeta y
   motivo. Esto define el alcance de la inspección.
2. En la sesión privada, cruzar `storage.objects` contra las relaciones dueñas
   conocidas, sin producir URLs ni tokens:

   ```sql
   -- SÓLO LECTURA. Ejecutar en sesión privada con service_role.
   SELECT o.bucket_id,
          split_part(o.name, '/', 1) AS primera_clave,
          o.created_at,
          sb.id            AS supplier_bill_id,
          sb.organization_id
     FROM storage.objects o
     LEFT JOIN public.supplier_bills sb
            ON (o.bucket_id = 'supplier-bill-cfdi-xml'
                AND lower(sb.cfdi_uuid) = lower(split_part(o.name, '/', 1)))
            OR (o.bucket_id = 'supplier-payment-receipts'
                AND sb.id::text = lower(split_part(o.name, '/', 1)))
    WHERE o.bucket_id IN ('supplier-bill-cfdi-xml', 'supplier-payment-receipts')
      AND NOT EXISTS (SELECT 1 FROM public.organizations org
                       WHERE split_part(o.name, '/', 1) = org.id::text)
    ORDER BY o.bucket_id, o.created_at;
   ```

3. Para un objeto **sin coincidencia**, la atribución no se adivina: se busca
   evidencia de negocio fuera de Storage (fecha de alta contra la bitácora de
   captura, proveedor del CFDI, póliza contable, correo de origen). Si esa
   evidencia no identifica **una sola** empresa, el objeto **se queda en
   cuarentena**. No decidir es un desenlace válido.
4. Nada de lo observado se copia a documentos compartidos: sólo se registra la
   conclusión en el paso siguiente.

### 3. Cómo se registra una resolución explícita

La decisión se asienta en `public.storage_migration_manual_resolutions`
(migración `0034`): tabla con RLS activa, **deny-all** para `anon` y
`authenticated` y grants **sólo** a `service_role`. Una fila lleva cubeta, ruta
exacta, empresa resuelta, operador, justificación (mínimo 10 caracteres),
evidencia opcional, `revalidated_at` y `status` (`active` / `revoked`). La
identidad cubeta+ruta es única, de modo que no puede haber dos decisiones
contradictorias vivas.

### 4. Revalidación antes de permitir la copia

Registrar **no** autoriza nada por sí solo. En cada corrida,
`evaluateManualResolution()` revalida contra el estado vivo y **falla cerrado**
ante cualquiera de estos casos:

| Rechazo                     | Motivo                                                    |
| --------------------------- | --------------------------------------------------------- |
| `no_manual_resolution`      | no hay decisión registrada                                |
| `revoked`                   | la decisión fue revocada                                  |
| `identity_mismatch`         | la fila no corresponde exactamente a ese objeto           |
| `missing_justification`     | la justificación es insuficiente                          |
| `incomplete_lookup`         | la lectura de dueños no se agotó: el operador no vio todo |
| `unsupported_bucket`        | la cubeta no tiene relación dueña definida                |
| `contradicts_derived_owner` | contradice un dueño derivado con certeza                  |
| `unknown_organization`      | la empresa no existe                                      |
| `inactive_organization`     | la empresa está suspendida                                |
| `revalidation_expired`      | la revalidación tiene más de 24 h o es futura             |

Sólo si la revalidación pasa, el objeto entra al flujo normal
**copy → verify → update references → observe → delete**, con la fase de borrado
igual de separada y apagada por defecto. `delete_sources` no lee esta tabla y sus
comprobaciones quedan intactas.

Este tramo **no se ejecutó** contra producción: no se inspeccionaron objetos
reales, no se registró ninguna resolución y no se movió ni borró nada.

### 5. El ledger histórico no autoriza nada (corrección 8.19.1)

**Regresión detectada en 0034.** `apply_orphans` calculaba los candidatos con
las resoluciones vigentes, pero `applyOrphanBatch()` releía del ledger **todas**
las filas `orphaned` en `planned`, `copied` o `failed` sin filtrarlas. Una
resolución aprobada en una corrida anterior dejaba su fila en el ledger, y si
después se revocaba, caducaba o dejaba de pasar la revalidación, la siguiente
corrida **igual copiaba** el objeto: el ledger viejo funcionaba como
autorización permanente.

Corregido: cada corrida deriva una **allowlist exacta** de
`bucket + source_path + organization_id` a partir de los candidatos aprobados
**en esa misma ejecución** (`makeApprovedOrphanKeySet`), y el lote se filtra
contra ella (`filterOrphanLedgerToApproved`) antes de tocar nada. Reglas:

- Allowlist vacía ⇒ **no se procesa ninguna fila**, sea cual sea su estado.
- Una fila del ledger cuya empresa no coincide exactamente con la aprobada se
  ignora; no se copia y **no cambia de estado**.
- El resultado reporta además `skipped`: filas del ledger descartadas por no
  estar aprobadas hoy.
- `delete_sources` sigue sin cargar índice de dueños ni resoluciones manuales,
  por lo que su allowlist es vacía por construcción y sus comprobaciones no se
  tocaron.

Regresión cubierta en `supabase/functions/_shared/storageQuarantine_test.ts`:
primer apply con resolución vigente sí procesa el objeto; el segundo, con la
resolución revocada, caduca o contradictoria con el dueño derivado, no copia
nada ni cambia estados. Verificación local: **438 pruebas Deno**, `deno fmt
--check` y `deno lint` en verde. Sin producción.

### 6. El lote no puede ahogar a la fila aprobada (corrección 8.19.2)

**Starvation detectada.** El lote aplicaba `.limit(batchSize)` al ledger
**antes** de filtrar por la allowlist. Si las primeras `batchSize` filas en el
orden eran antiguas y ya no aprobadas (revocadas/caducas), el lote las releía
en cada corrida y una fila aprobada ubicada después **nunca se procesaba**.

Corregido: el lote **pagina** el ledger (páginas de 500) y acumula filas
aprobadas hasta reunir `batchSize` o agotar el conjunto, con un tope total de
exploración de 20,000 filas por corrida (si se alcanza, la corrida **falla
cerrado** en lugar de recorrer sin cota). Semántica de conteo consistente:

- Las filas no aprobadas que se exploraron cuentan como `skipped` y **no
  cambian** de estado.
- Con allowlist vacía no se abre el ledger: `skipped = 0` (nada se exploró).
- Una fila aprobada que exceda el tamaño del lote queda para la corrida
  siguiente; no se procesa dos veces.

Regresión nueva: con más de `batchSize` filas no autorizadas **antes** de la
autorizada en el orden del ledger, ninguna no autorizada cambia y la
autorizada sí avanza. Verificación local: **16/16 pruebas de cuarentena**,
`deno fmt --check`, `deno lint` y `deno check` en verde. Sin producción.

### 7. `copied` es estado terminal del lote de copia (corrección 8.19.3)

**Starvation residual.** La consulta del lote seguía incluyendo
`status = 'copied'`. Con más objetos aprobados que `batchSize`, las filas ya
copiadas permanecían primeras en el orden (`created_at` ascendente) y volvían a
llenar el lote en cada corrida: `ensureCopied()` sólo revalida el destino y
devuelve `copied`, así que el trabajo real —las filas `planned` posteriores—
nunca se alcanzaba.

Corregido: el conjunto pendiente de este modo es **`planned` y `failed`**
(`failed` se conserva para reintento). `copied` es **terminal** y queda fuera
del lote: ni se explora ni se cuenta como `skipped`. Si en algún momento hace
falta volver a verificar objetos ya copiados, debe hacerse en una **fase
explícita aparte** que no compita por el lote pendiente.

Regresión nueva: con `batchSize = 1` y ledger `[copied aprobado antiguo,
planned aprobado nuevo]`, la siguiente corrida procesa el **nuevo**.

#### Limitación conocida: revocar no borra destinos ya copiados

Revocar o dejar caducar una resolución manual **impide copias futuras**, pero
**no elimina automáticamente** el objeto que ya se copió al destino: el borrado
de cualquier objeto es una fase separada, deshabilitada por bandera, y nunca se
ejecuta como efecto de una revocación. Por diseño, esa fase jamás borra sin
verificación de bytes ni deja huérfanos.

Contención y limpieza segura (operador autorizado, `service_role`, entorno
privado; nunca desde la respuesta del endpoint, que sólo devuelve agregados):

1. Revocar la resolución manual (`revoked`) para cortar nuevas copias.
2. Dejar la **fuente intacta**: no borrar nada del origen mientras el caso esté
   en disputa; es la única copia con procedencia verificada.
3. Registrar el objeto copiado como contenido: no actualizar referencias de
   negocio hacia el destino, de modo que ningún flujo lo consuma.
4. Inspeccionar en privado, sólo lectura, para reconfirmar dueño y empresa.
5. La eliminación del destino indebido requiere una **aprobación separada y
   explícita** (nueva resolución o decisión operativa registrada), ejecutada
   bajo la fase de borrado con su bandera y confirmación propias, y sólo
   después de verificar que la fuente sigue existiendo e íntegra.

En ningún punto de este procedimiento se exponen rutas, URLs firmadas, tokens
ni identificadores en respuestas ni logs.
