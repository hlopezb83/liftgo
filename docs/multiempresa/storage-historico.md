# Auditoría de solo lectura · Storage histórico (multiempresa)

Fecha: 2026-09-17 · Estado: **propuesta documentada, nada ejecutado**

Fuente: informe `.lovable/plan.md` (commit `43d494d2a96225f86410888e3c71abdbddadaea9`) y verificaciones `SELECT` directas contra producción. Auditoría estrictamente de lectura: sin cambios de código, esquema, datos, policies, buckets ni objetos; sin DDL ni operaciones de Storage.

## 1. Buckets y objetos

Seis buckets, **todos privados**, confirmados por `SELECT` sobre `storage.buckets`:

| Bucket | Objetos | Límite de tamaño |
|---|---|---|
| cfdi-files | 173 | sin límite propio |
| supplier-bill-cfdi-xml | 78 | sin límite propio |
| supplier-payment-receipts | 53 | sin límite propio |
| documents | 5 | sin límite propio |
| feedback-screenshots | 1 | sin límite propio |
| payment-proofs | 0 | 10 000 000 bytes (10 MB) |

**Total: 310 objetos.**

- Los **310 objetos carecen de prefijo de organización**; los prefijos con forma UUID actuales son `customer_id` o `invoice_id`.
- **0 objetos en la raíz** de los buckets.
- **1 organización activa**; con una sola empresa no hay colisión posible. Al dar de alta la segunda, dos empresas podrían compartir `customer_id` y producir rutas ambiguas en `payment-proofs` y `cfdi-files`.
- Bitácoras de migración (`storage_object_migrations`, `storage_reference_migrations`): **0 filas; nada iniciado**.
- Referencias: 56 facturas con XML CFDI, 52 recibos de proveedor, 5 documentos; **0 referencias guardadas como URL http** (todas son paths), lo que simplifica un traslado futuro.

## 2. Policies y helpers

- **25 policies en `storage.objects`** (conteo corregido; un conteo previo reportó 26 por duplicar una fila): **8 de SELECT y 17 de INSERT/UPDATE/DELETE**, según `SELECT * FROM pg_policies WHERE schemaname='storage' AND tablename='objects'`.
- Helpers de aislamiento confirmados en producción: `current_organization_id()`, `storage_prefix_organization`, `storage_path_in_current_organization`, `invoice_in_current_organization` (definidos en `drizzle/migrations/0022_storage_tenant_scoped_policies.sql:20-80`).

## 3. Convenciones de rutas y handlers

- Ruta nueva obligatoria: `<organization_id>/<path>` (`supabase/functions/_shared/storagePath.ts:21-48`, espejo en `src/lib/storage/organizationPath`).
- Rutas legadas sin prefijo: 0021/0022 solo permiten leerlas/borrarlas, nunca crear rutas cruzadas.
- Escritura privilegiada con organización derivada del registro (no del navegador): `stamp-cfdi/handler.ts:674`, `stamp-credit-note/handler.ts:550,578`, `stamp-payment-complement/handler.ts:565,583`, `validate-supplier-rep/index.ts:266,286`, `reconcile-stamping-invoices/index.ts:498,527,754,777,1013,1036`.
- Server function de proveedor: `src/lib/supplierRep.functions.ts:167,182`.
- Cliente: `src/hooks/useDocuments.ts:50,76,104`; `src/lib/storage/openStorageFile.ts` firma URLs de 60 s.
- **Riesgo identificado:** `openStoredFile` (`openStorageFile.ts:34-44`) abre URLs legadas tal cual. La inspección actual no encontró referencias URL http en la base, pero si alguna apareciera, se abriría sin re-derivación de organización; conviene prueba conductual cross-tenant con dos organizaciones.
- Migrador administrativo ya escrito y **sin ejecutar**: `supabase/functions/migrate-storage-org-prefix/index.ts` — orden copy → refs → verify → delete; triple barrera: auth cron/service, `STORAGE_MIGRATION_APPLY_ENABLED`, confirmación textual; cuenta con modo plan (solo inventario) y modo apply.

## 4. Plan propuesto de migración de históricos (no autorizado, no ejecutado)

1. **Inventario**: migrador en modo plan; ledger con `source_path`/`destination_path` y SHA-256. Parar si aparece un objeto sin organización derivable.
2. **Copia (staging)**: copiar a `<organization_id>/<ruta_actual>` sin borrar el origen. Rollback = borrar la copia.
3. **Verificación A/B**: comparar tamaño y hash origen/destino objeto por objeto; contrastar conteos por bucket antes/después.
4. **Actualización de referencias por lote**: por tabla/columna del `REFERENCE_SPECS`, con rollback por SHA-256 guardado.
5. **Doble lectura y observación**: la app intenta primero la ruta con prefijo y cae a la legada, hasta que el 100 % del ledger esté en `references_updated`.
6. **Borrado del origen**: solo al final, tras 100 % verificado y ventana de observación, y **solo con autorización explícita**. Irreversible.

**Condiciones de parada (antes del borrado):** cualquier diferencia de hash/tamaño, un objeto huérfano sin referencia, un error de permisos, o la existencia de la segunda empresa sin ensayo previo en entorno aislado.

**Rollback:** mientras no se borre el origen, basta borrar las copias y revertir las referencias usando el SHA-256 del ledger.

## 5. Dependencia operativa REP (precondición crítica de despliegue)

- Producción **no tiene** `public.is_internal_member(uuid)` ni `public.user_in_current_organization(uuid)`.
- `drizzle/migrations/0025_*.sql` define `is_internal_member`; `drizzle/migrations/0026_rep_number_org_scoped_assignment.sql` la **invoca**.
- Por tanto, **0026 sola no está lista para producción**: hay que comprobar qué migraciones de la cadena 0021–0025 faltan en producción y aplicarlas **en orden** (incluida 0025), o hacer 0026 autocontenida.
- Antes de cerrar el tramo 8.1 se exige smoke en entorno aislado con **ambos** casos: ejecución de la firma estricta como usuario interno **autenticado** y ejecución del wrapper como **service_role**.

## 6. Cobertura y pendientes

Cubierto para archivos **nuevos**: prefijo de organización obligatorio, policies tenant-aware, helpers `SECURITY DEFINER`, prueba RLS `supabase/tests/rls/storage_org_prefix.sql`.

Pendiente para **históricos**: los 310 objetos siguen sin prefijo; la doble lectura y el traslado no se han ejecutado; el traslado **no está autorizado ni ejecutado**.

Decisiones aún pendientes:

- Catálogos: `suppliers`, `equipment_models`, `bank_accounts`.
- Autorización y secuencia 0025→0026 en producción + despliegue de Edge Functions.
- **Ensayo con dos organizaciones en entorno aislado — requisito previo e indispensable antes del alta real de otra empresa.**
- Ventana de alta de la segunda empresa (solo después del ensayo y de cerrar el bypass del folio REP).

## Actualización 8.9.0 — cierre del riesgo entre empresas (repositorio, no aplicado en producción)

La auditoría previa se limitó a los objetos históricos. Al escribir la prueba A/B
con dos organizaciones aparecieron huecos **en las policies vigentes**, no sólo en
las rutas antiguas:

| Bucket | Policies sin alcance por organización (antes de 0027) |
| --- | --- |
| `documents` | `Staff upload documents`, `Staff update documents`, `Staff delete documents` |
| `documents` (portal) | `Customers read own scoped documents` → resolvía por `customer_id` global |
| `feedback-screenshots` | `Admins read all feedback screenshots`, `Admins delete any feedback screenshot` |
| `cfdi-files` | lectura, alta, reemplazo y borrado por admin |
| `supplier-payment-receipts` | las 4 policies |
| `supplier-bill-cfdi-xml` | lectura de staff + alta/reemplazo/borrado |

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
