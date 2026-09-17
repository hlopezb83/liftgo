# Auditoría de solo lectura · Storage histórico (multiempresa)

Estado: propuesta. No se cambió código, esquema, datos ni producción. Todas las consultas fueron SELECT. Esta versión incorpora las comprobaciones directas recientes contra producción.

## 1. Buckets, policies y funciones

Seis buckets, **todos privados** (confirmado por `SELECT` sobre `storage.buckets`):

| Bucket | Objetos | Límite de tamaño |
|---|---|---|
| cfdi-files | 173 | sin límite propio |
| supplier-bill-cfdi-xml | 78 | sin límite propio |
| supplier-payment-receipts | 53 | sin límite propio |
| documents | 5 | sin límite propio |
| feedback-screenshots | 1 | sin límite propio |
| payment-proofs | 0 | 10 000 000 bytes (10 MB) |

**Policies de `storage.objects`: 25 en total** — 8 de SELECT y 17 de INSERT/UPDATE/DELETE, según `SELECT * FROM pg_policies WHERE schemaname='storage' AND tablename='objects'` conectado a producción. El informe anterior reportó 26; ese conteo fue incorrecto (probablemente contó una fila duplicada por nombre de policy compartida entre comandos). Cifra correcta y reproducible: 25.

Helpers de aislamiento confirmados en producción: `current_organization_id()`, `storage_prefix_organization`, `storage_path_in_current_organization`, `invoice_in_current_organization` (definidos en `drizzle/migrations/0022_storage_tenant_scoped_policies.sql:20-80`).

## 1a. Precondición crítica de despliegue: helpers de membresía ausentes

La introspección de producción **NO devuelve** `public.is_internal_member(uuid)` ni `public.user_in_current_organization(uuid)`. Sin embargo:

- `drizzle/migrations/0025_*.sql` (repo) define `is_internal_member`.
- `drizzle/migrations/0026_rep_number_org_scoped_assignment.sql` (tramo 8.1, aprobado en repo) **invoca `is_internal_member`**.

**Consecuencia:** aplicar 0026 sola en producción fallará o dejará la RPC estricta inutilizable, porque su dependencia (0025) no existe ahí.

**Precondición obligatoria antes de aplicar 0026:**
1. Comprobar qué migraciones de la cadena 0021–0025 están aplicadas en producción (introspección de funciones/policies), y aplicar **en orden** las que falten (incluida 0025), **o** ajustar 0026 para que sea autocontenida (incluir la definición de `is_internal_member` en ella).
2. Exigir smoke autenticado en entorno aislado que confirme la ejecución de la **firma estricta** `assign_stamped_rep_number(uuid,text,uuid)` como usuario interno autenticado, **además** del caso service_role (wrapper de dos parámetros).
3. **0026 no debe darse por lista para producción** mientras esta dependencia no esté resuelta y el smoke autenticado no pase.

## 2. Convenciones de rutas

- Ruta nueva obligatoria: `<organization_id>/<...>` (`supabase/functions/_shared/storagePath.ts:21-48`, espejo en `src/lib/storage/organizationPath`).
- Rutas legadas: sin prefijo de organización; 0021/0022 solo permiten leerlas/borrarlas, nunca crear rutas cruzadas.
- Medición real (conteo agregado, sin nombres):

```sql
with orgs as (select id::text t from public.organizations),
o as (select bucket_id, name,
  exists(select 1 from orgs where split_part(o.name,'/',1)=orgs.t) as tiene_org,
  array_length(string_to_array(o.name,'/'),1) as segs
  from storage.objects o)
select bucket_id, tiene_org, segs, count(*) from o group by 1,2,3 order by 1,2,3;
```

Resultado confirmado: **310 de 310 objetos sin prefijo de organización y 0 objetos en la raíz** (cfdi-files 173, supplier-bill-cfdi-xml 78, supplier-payment-receipts 53, documents 5, feedback-screenshots 1, payment-proofs 0). Los prefijos con forma UUID que existen hoy son `customer_id` o `invoice_id`, no organización. Con una sola empresa no hay colisión posible; al dar de alta la segunda, dos empresas podrían compartir `customer_id` y producir rutas ambiguas en `payment-proofs` y `cfdi-files`.

## 3. Handlers de upload / download / delete / list

- Escritura privilegiada (siempre con organización derivada del registro, no del navegador): `stamp-cfdi/handler.ts:674`, `stamp-credit-note/handler.ts:550,578`, `stamp-payment-complement/handler.ts:565,583`, `validate-supplier-rep/index.ts:266,286`, `reconcile-stamping-invoices/index.ts:498,527,754,777,1013,1036`.
- Server function de proveedor: `src/lib/supplierRep.functions.ts:167,182`.
- Cliente: `src/hooks/useDocuments.ts:50,76,104` (documents), `src/lib/storage/openStorageFile.ts` firma URLs de 60 s y abre URLs legadas tal cual (`openStoredFile:34-44`).
- Migrador administrativo ya escrito y sin ejecutar: `supabase/functions/migrate-storage-org-prefix/index.ts` (orden copy → refs → verify → delete; triple barrera: auth cron/service, `STORAGE_MIGRATION_APPLY_ENABLED`, confirmación textual).

Pendiente de verificar en el siguiente tramo: que ninguna ruta de portal acepte `path` arbitrario del cliente al firmar URLs (hoy `openStorageFile` recibe el path desde el registro, pero conviene una prueba conductual cross-tenant con dos organizaciones).

## 4. Conteos agregados

- Total de objetos: 310; con prefijo de organización: 0; en raíz: 0.
- Referencias: 56 facturas con XML CFDI, 52 recibos de proveedor, 5 documentos; **0 referencias guardadas como URL http** (todas son paths), lo que simplifica la migración.
- Bitácora de migración (`storage_object_migrations`, `storage_reference_migrations`): 0 filas; nada iniciado.
- Organizaciones activas: 1.

## 5. Plan reversible de migración de históricos (propuesta, no ejecutar)

1. **Inventario**: correr el migrador en modo plan; poblar el ledger con `source_path`/`destination_path` y SHA-256 del valor original. Parar si aparece un objeto sin organización derivable.
2. **Staging**: copiar a `<organization_id>/<ruta_actual>` sin borrar el origen. El origen queda intacto: rollback = borrar la copia.
3. **Doble lectura temporal**: la app intenta primero la ruta con prefijo y cae a la legada. Ventana mínima sugerida: hasta que el 100 % del ledger esté en `references_updated`.
4. **Verificación A/B**: comparar tamaño y hash de origen vs destino objeto por objeto; contrastar conteos por bucket antes/después.
5. **Actualización de referencias**: por tabla/columna del `REFERENCE_SPECS`, en lotes, con rollback por SHA-256 guardado.
6. **Borrado del origen**: solo tras 100 % verificado y una ventana de observación. Irreversible; requiere autorización explícita.

Condiciones de parada: cualquier diferencia de hash/tamaño, un objeto huérfano sin referencia, un error de permisos, o si ya existe la segunda empresa sin ensayo previo en entorno aislado.

## 6. Cobertura del tramo Storage aprobado vs. pendiente

Cubierto para archivos **nuevos**: prefijo de organización obligatorio, policies tenant-aware, helpers `SECURITY DEFINER`, prueba RLS `supabase/tests/rls/storage_org_prefix.sql`.

Pendiente para **históricos**: los 310 objetos siguen sin prefijo; la doble lectura y el traslado no se han ejecutado; falta ensayo con dos organizaciones en entorno aislado; **confirmado** que `is_internal_member` y `user_in_current_organization` no existen en producción (ver §1a, precondición crítica para 0026).

## Decisiones aún pendientes

- Catálogos: `suppliers`, `equipment_models`, `bank_accounts`.
- Ventana de alta de la segunda empresa.
- Autorización para aplicar migraciones en producción: primero resolver la cadena 0025→0026 (§1a), desplegar después las Edge Functions, y ejecutar smoke autenticado (firma estricta) + service_role antes de cerrar el tramo 8.1.
