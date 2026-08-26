# fix-23 + fix-24 — Validación y plan (v7.354.0)

Ambos paquetes fueron verificados contra la base real. **Los 10 hallazgos son reales.**

## fix-23 (ya aprobado, pendiente de ejecutar)

- **R4-17**: `sync_forklift_rental_status` no fija `app.forklift_rpc`, así que la guarda N-42 aborta el paso `rented -> available`.
- **R4-18**: `extend_booking` no valida órdenes de trabajo `in_progress` (sí lo hace `create_booking`).
- **R4-19**: `revert_audit_log` no tiene bypass; las guardas de transición pueden tumbar una reversión legítima de admin.
- **R4-26**: `cancel_booking` actualiza `forklifts` sin la bandera interna y puede abortar por la misma guarda N-42.
- **R4-27**: la vista `v_invoices_with_balance` tiene ACL `anon=arwdDxtm` (acceso anónimo).

## fix-24 (nuevos hallazgos confirmados)

**R4-20 — El seed regala admin (real)**
`supabase/seed.sql` asigna `admin` al usuario de auth más antiguo sin filtro. Se cambia a opt-in por GUC `app.seed_admin_email`; sin GUC no se asigna ningún rol.

**R4-21 — Seeding E2E demasiado abierto (real)**
`company_settings.allow_e2e_seed` tiene DEFAULT `true` y la fila actual está en `true`; además `e2e_seed_portal_scenario` inserta el rol `customer` para un email arbitrario. Se pasa a DEFAULT `false`, se apaga en las filas existentes y se elimina la inserción de rol (el portal ya se vincula por `customers.user_id`).

**R4-28 — Bucket `payment-proofs` sin borrado ni límites (real)**
Solo existen policies de INSERT y SELECT; el bucket no tiene `file_size_limit` ni `allowed_mime_types`. Se agrega policy de DELETE (cliente solo su propio comprobante mientras el intent siga `pending_review`; admin/administrativo con acceso total) y se limita a PDF/JPEG/PNG/WEBP y 10 MB.

**R4-33 — Fuga de errores internos (real)**
`invite-user/index.ts:114` devuelve `roleResult.message` y `validate-supplier-rep/index.ts:318` devuelve el error crudo de BD. Se sustituyen por mensajes genéricos con detalle solo en log.

**R4-32 — Facturación recurrente omite tarifas de $0 pactadas (real)**
`generate-recurring-invoices` marca `no_monthly_rate` cuando `monthlyRate === 0`, contradiciendo N-7c. Se distingue "sin tarifa configurada" (null en reserva y maestra) de "tarifa 0 pactada".

## Ejecución

1. Cinco migraciones de fix-23 (R4-17, R4-18, R4-19, R4-26, R4-27).
2. Migración R4-20 no aplica a BD: se edita `supabase/seed.sql`.
3. Migración R4-21: default `false` + apagado de filas + recreación de `e2e_seed_portal_scenario` sin asignación de rol, con `REVOKE`/`GRANT EXECUTE` a `authenticated`.
4. R4-28: policy DELETE por migración; los límites de MIME/tamaño se aplican con la herramienta de buckets (no se permite `UPDATE storage.buckets` en migraciones).
5. R4-33 y R4-32: cambios en las Edge Functions indicadas.
6. Changelog **v7.354.0** (minor) + archivo de detalle.

## Notas técnicas y riesgos

- Con `allow_e2e_seed` en `false`, el job E2E de CI dejará de sembrar. Se añade un paso explícito en el workflow de CI que lo active tras aplicar migraciones, para no romper la suite.
- Quitar el rol `customer` del seed E2E solo es seguro porque las policies del portal resuelven por `get_customer_id_for_user()` / `customers.user_id`; se validará ejecutando las suites RLS del portal.
- Todas las funciones se recrean con `SECURITY DEFINER`, `SET search_path = public` y sus guards de rol, conforme a las reglas permanentes de migraciones.
- Verificación: `scripts/lint-migrations.ts`, `deno check/lint/fmt` en funciones, suites SQL/RLS y la suite Vitest completa.
