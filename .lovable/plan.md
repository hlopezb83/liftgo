# Bloque 6 (R4) — Deuda técnica y seguridad de código

Objetivo: cerrar los hallazgos de código del reporte R4 con foco en **seguridad de datos** (RLS/write-only) y **race conditions** ya identificadas en auditorías previas.

## Alcance

### 6.1 `billing_secrets` write-only (CRITICAL)
- Migración: revocar `SELECT` de `authenticated` sobre `public.billing_secrets`. Mantener `SELECT` sólo para `service_role`.
- Refactor cualquier `.from("billing_secrets").select(...)` del cliente: mover a Edge Function con `service_role`.
- Verificar que la UI de Facturapi (`/settings/company/billing`) siga funcionando via RPC/Edge Function que no expone la API key.

### 6.2 RLS `payment_intents` (HIGH)
- Confirmar policies actuales; añadir política de `SELECT/INSERT/UPDATE` por `has_role('admin'|'administrativo')`.
- GRANT explícito a `authenticated` y `service_role`.

### 6.3 REP claim leak (HIGH)
- Auditar `prepare_payment_complement` + `stamp-cfdi` para asegurar que el `claim_token` se libera en `finally` incluso en abort/timeout.
- Test de reproducción: simular timeout de Facturapi y validar que el segundo intento no bloquee.

### 6.4 Cobertura adicional
- Test unitario para `searchEntities` en `GlobalSearch` (invoices/customers/bookings, ≥2 chars, límite 5).
- Guardas null en `invoice_number`/`booking_number` (fallback `"—"`).

### 6.5 Cleanup
- `knip` sobre `src/` y `supabase/functions/` para detectar dead code residual (post-Bloque 5).
- Reportar sin borrar automáticamente si el impacto es >20 archivos; borrar los evidentes.

## Detalle técnico

```text
supabase/migrations/
  YYYYMMDD_billing_secrets_write_only.sql   ← revoke SELECT authenticated
  YYYYMMDD_payment_intents_rls.sql          ← policies + grants
src/features/settings/company/billing/      ← eliminar reads directos
supabase/functions/get-billing-config/      ← nueva EF (o extender existente)
src/layouts/__tests__/globalSearchEntities.test.ts   ← nuevo
```

## Salida
- Cambios agrupados en **v7.150.0** (minor: seguridad + refactor).
- Changelog `public/changelog/v7.150.0.json` con detalle por hallazgo.
- `bunx tsgo` + `bunx vitest run` en verde + `supabase--linter` sin nuevos warnings.

## Riesgo
- El refactor de `billing_secrets` puede romper la pantalla de Facturapi si algún componente aún hace `.select()`. Mitigación: grep exhaustivo previo a la migración y validación con Playwright del flujo de timbrado.

## Fuera de alcance
- Nuevas features UX; sólo se cierran hallazgos de código del reporte R4.
