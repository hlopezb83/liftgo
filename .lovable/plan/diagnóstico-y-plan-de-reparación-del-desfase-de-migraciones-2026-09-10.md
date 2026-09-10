# Diagnóstico y plan de reparación del desfase de migraciones

Solo lectura hasta aquí: no se editó código, no se aplicaron migraciones y no se tocó producción.

## Qué pasó (verificado)

El registro de migraciones de producción (`supabase_migrations.schema_migrations`) salta de `20260908063141` a `20260910012344`. Los cinco archivos del 9 de septiembre existen en el repositorio pero **nunca quedaron registrados ni aplicados**:

- `20260909100000_financial_integrity.sql`
- `20260909100500_damage_invoice_integrity.sql`
- `20260909101000_lifecycle_integrity.sql`
- `20260909102000_data_integrity.sql`
- `20260909103000_invoice_reconciliation_transition.sql`

Causa: esos archivos se escribieron a mano en el repo (nombres descriptivos, no el patrón `<fecha>_<uuid>` que genera la herramienta de migraciones). En Lovable Cloud la base sólo ejecuta lo que pasa por la herramienta de migraciones; un archivo en `supabase/migrations/` no se aplica por sí solo. En cambio `20260910012344` sí se creó con la herramienta (arreglo del `ESCAPE` bancario) y por eso está en producción, aunque su archivo es *posterior* a los cinco pendientes.

Por qué "algunas funciones de esas áreas sí existen": esas funciones fueron creadas por migraciones **anteriores** ya aplicadas, y los archivos del 9 de septiembre solo las **reemplazaban** con una versión nueva. Verificado: `guard_invoice_status_integrity`, `validate_transition`, `mark_started_bookings_rented`, `get_available_forklifts`, `soft_delete_damage_record`, etc. están definidas también en migraciones de julio/agosto. Producción corre las versiones viejas.

## Lo que realmente falta hoy en producción

Objetos que no existen en ningún lado y que la app sí llama (fallan con "función no encontrada"):

- `begin_bank_statement_upload`, `stage_bank_statement_chunk` (y `finalize_bank_statement_upload`, `cleanup_bank_statement_uploads`)
- `get_bank_reconciliation_kpis`
- `get_portal_invoice`, `get_portal_invoices_page`, `get_portal_contracts_page`
- `get_my_feedback_points_total` (y `get_feedback_reports_by_status`)
- tablas `bank_statement_uploads`, `bank_statement_upload_chunks` con sus políticas e índices

Además faltan guards/versiones nuevas: `guard_damage_billing_requires_repair`, `guard_archived_damage_immutable`, `ensure_forklift_maintenance_for_open_damage`, `guard_forklift_sale_commitments`, `complete_delivery`, `get_sale_available_forklifts`, `get_cash_flow_recurring_bookings`, `claim_credit_note_for_stamping`, `guard_credit_note_stamping_snapshot`, y el índice `feedback_reports_status_cursor_idx`.

## Riesgos concretos al reaplicar tal cual (por eso no se hace directo)

1. **Orden vs. el fix ya aplicado.** `102000` redefine `get_bank_statement_lines_page` con la búsqueda *sin* escape. Si se aplica después de `20260910012344`, se revierte el arreglo de `%`, `_` y `\`. El bloque escapado debe ir al final.
2. **Sentencias no idempotentes.** `CREATE TABLE` sin `IF NOT EXISTS`, `CREATE UNIQUE INDEX bank_statement_lines_account_hash_occ_uq` sin guarda, `CREATE POLICY` y `CREATE TRIGGER` sin `DROP ... IF EXISTS` previo en algunos casos.
3. **Escrituras de datos en producción.** `102000` recalcula `hash`/`occurrence` de **toda** `bank_statement_lines`; `100500` hace un `UPDATE` de respaldo sobre `damage_records`. Requieren autorización explícita aparte y verificación de conteos antes/después.
4. **Cambio de firma.** `save_invoice_with_bookings` en `100500` tiene 5 argumentos; producción tiene 4. `CREATE OR REPLACE` crearía una **sobrecarga** ambigua en vez de reemplazar. Hay que decidir firma única y borrar la otra.
5. **Permisos.** `102000` hace `REVOKE INSERT` sobre `bank_statement_imports` y `bank_statement_lines` para `authenticated`. Es intencional (obliga a usar la vía transaccional) pero rompe cualquier cliente viejo; debe entrar junto con las RPC nuevas, no antes.
6. **Dependencias entre archivos.** `103000` (`validate_transition`) asume estados creados por `101000`; `102000` asume el fingerprint recalculado. El orden 100000 → 100500 → 101000 → 102000 → 103000 → re-fix ESCAPE es obligatorio.
7. **Cron.** `102000` programa la limpieza de cargas; hay que evitar duplicar el job si ya existiera.
8. **Caché de esquema.** PostgREST no ve funciones nuevas hasta recargar; sin `NOTIFY pgrst, 'reload schema'` seguirían los errores aunque la función exista.

## Plan de reparación propuesto

**Fase 0 — Congelar y confirmar.** Reconfirmar el diagnóstico con las consultas de verificación (abajo, todas de lectura) y acordar ventana de baja actividad. Sin cambios.

**Fase 1 — Lote A, solo objetos faltantes y sin escrituras de datos.** Una migración nueva (creada con la herramienta, timestamp posterior a `20260910012344`) que contenga únicamente: tablas de staging bancario + RLS + políticas + grants, las RPC ausentes (`begin/stage/finalize/cleanup`, `get_bank_reconciliation_kpis`, portal, feedback), y el índice de feedback. Todo con `IF NOT EXISTS` / `DROP ... IF EXISTS` previo, y `REVOKE ... FROM PUBLIC, anon` + `GRANT EXECUTE` explícito por función. Sin `UPDATE`/`DELETE` de datos, sin `REVOKE INSERT` todavía.

**Fase 2 — Lote B, guards y versiones nuevas de funciones ya existentes.** Reemplazos de `100000`, `100500` y `101000` en su orden original, con `DROP TRIGGER IF EXISTS` antes de cada `CREATE TRIGGER` y resolución explícita de la firma de `save_invoice_with_bookings` (elegir una, borrar la sobrante). Aquí se decide si el `UPDATE` de respaldo de `damage_records` se ejecuta o se omite; requiere tu autorización expresa por ser dato productivo.

**Fase 3 — Lote C, endurecimiento y datos.** `REVOKE INSERT` sobre las tablas bancarias, recálculo de `hash`/`occurrence` + índice único, `validate_transition` de `103000`, y el job de limpieza (creándolo sólo si no existe). Es el lote que toca datos: se corre con conteos previos y una comparación posterior.

**Fase 4 — Reafirmar el fix ESCAPE.** Última sentencia: volver a crear `get_bank_statement_lines_page` con el patrón escapado, para que ningún lote lo haya pisado.

**Fase 5 — Cerrar el desfase del historial.** Los cinco archivos del 9 de septiembre quedan como histórico documental; el estado real queda representado por los nuevos archivos generados por la herramienta. Se documenta en `docs/` que sólo cuentan como aplicadas las migraciones con timestamp+uuid, y opcionalmente se añaden encabezados de "superseded by" en los cinco archivos para que nadie los reaplique.

## Verificaciones posteriores (todas de lectura)

SQL:

1. `select version from supabase_migrations.schema_migrations order by version desc limit 10;` — deben aparecer los nuevos lotes.
2. Existencia y firma: `select proname, pg_get_function_identity_arguments(oid) from pg_proc ... where proname in (...)` para las 7 RPC faltantes; `save_invoice_with_bookings` debe aparecer **una sola vez**.
3. Grants: `select routine_name, grantee, privilege_type from information_schema.role_routine_grants where specific_schema='public'` — `anon` sin `EXECUTE` en las RPC internas, `authenticated` con `EXECUTE` en las de la app.
4. Tablas: existencia de `bank_statement_uploads` y `bank_statement_upload_chunks`, `relrowsecurity = true`, y sus dos políticas.
5. Escape vigente: `prosrc ilike '%ESCAPE%'` en `get_bank_statement_lines_page` (debe ser verdadero al final).
6. Triggers esperados presentes en `invoices`, `damage_records`, `deliveries`, `forklifts`, `credit_notes` vía `pg_trigger`.
7. Integridad de datos del lote C: conteo total de `bank_statement_lines` igual antes/después y cero duplicados en `(bank_account_id, hash, occurrence)`.
8. `select jobname, schedule from cron.job` — un solo job de limpieza.
9. `NOTIFY pgrst, 'reload schema';` y luego reintentar los `select` de esquema.

URL / app (vista previa primero, producción después):

- `/bank-reconciliation`: KPIs cargan y la búsqueda con `%`, `_` y `\` devuelve resultados literales.
- Importación de estado de cuenta: subida por bloques termina sin error.
- `/portal/invoices`, detalle de factura y `/portal/contracts`: listados paginados sin error de función.
- `/portal/leaderboard` o vista de puntos de feedback: total visible.
- Consola del navegador y red sin respuestas `PGRST202` ni 404 en llamadas RPC.

## Restricciones asumidas

Nada se aplica en este turno. Cada fase se propone por separado; las fases 2 y 3 tocan permisos y datos productivos y no se ejecutarán sin tu autorización explícita, con la app en baja actividad.
