## Validación

Verifiqué los hallazgos críticos en el código real:

- **N1** ✅ `INSPECTION_CONDITIONS = ["good","minor_damage","major_damage","needs_repair"]` en `src/lib/constants.ts:52`; la última versión del RPC `complete_return_inspection` es la migración `20260723060348`. Confirmado el mismatch.
- **N2** ✅ `PortalInvoicePayment.tsx:38` calcula `balance = total − paid` sin restar `credited_amount`. Bug real.
- **N3** ✅ `/fleet/new`, `/quotes/new`, `/contracts/new`, `/fleet/:id/edit`, etc. no tienen `minAccess`. Solo `/invoices/*` lo declaran.
- **N6** ✅ Confirmado en `src/lib/rules/invoices.ts` (ya identificado en arq2).
- **N13** ✅ `shouldPersistQuery` no filtra por `status === "pending"`.
- **N8/N10** ✅ `ALWAYS_VISIBLE_ROUTES` incluye `/audit` y `/activity`; "Auditoría" no está en `useRolePermissions.MANAGEABLE_MODULES`.
- **N12** ❌ NO es bug, según el propio reporte. Solo añadir test aclaratorio (opcional — lo incluyo).

Todo listo para ejecutar como **v7.222.0**.

## Plan (v7.222.0)

### Bloque 1 — Bloqueantes

1. **N1 — RPC de inspección alineado con la UI**
   - Nueva migración `20260725120000_inspection_damage_conditions.sql` que reemplaza `complete_return_inspection` preservando el cuerpo actual (idempotencia, rango temporal, guards de rol) y solo cambia:
     - `v_is_damaged_condition := p_condition IN ('damaged','minor_damage','major_damage','needs_repair')`
     - `v_new_status := CASE WHEN p_condition IN ('damaged','major_damage','needs_repair') THEN 'maintenance' ELSE 'available' END`
   - Test unitario Deno + verificación con `supabase--linter`.

2. **N2 — Saldo portal NC-aware**
   - `src/features/portal/pages/PortalInvoicePayment.tsx`: `balance = total − paid − (credited_amount ?? 0)`.

3. **N3 — `minAccess:"full"` en rutas de mutación + gate de botones**
   - `src/routes/routes-config.tsx`: añadir `minAccess:"full"` a `/fleet/new`, `/fleet/:id/edit`, `/quotes/new`, `/quotes/:id/edit`, `/contracts/new`, `/contracts/:id/edit`. Mantener `/bookings/new` con `adminOnly: true` (decisión de producto vigente).
   - Gate con `useHasModuleAccess("<Módulo>").can("full")` en los botones de acción primaria de: `FleetPage`, `QuotesPage`, `ContractsPage`, `CustomersPage`, `SuppliersPage`.

### Bloque 2 — Medios

4. **N4 — Contrato desde reserva** — en `useContractFormLogic.ts`, obtener `booking.forklift_id` cuando hay `bookingId` y añadirlo a la lista permitida junto a `available` y `currentId`.

5. **N5 — Invalidar branding público** — en `src/features/company-settings/lib/queryKeys.ts`, reordenar declaraciones y añadir `publicBrandingQueries.keys.all` a `COMPANY_SETTINGS_INVALIDATION_KEYS`.

6. **N6 — Botón Registrar Pago balance-aware** — `src/lib/rules/invoices.ts`: extender `InvoiceLike` con `balance?: number|null`; ocultar botón si `balance <= 0`. Pasar `balance` desde el detalle.

7. **N7 — Validación de email en invitación** — `InviteUserDialog.tsx`: Zod inline (`z.string().trim().email()`), error inline, sin llegar al edge function.

8. **N8+N10 — Sidebar Auditoría gestionable**
   - Quitar `/audit` y `/activity` de `ALWAYS_VISIBLE_ROUTES`.
   - Añadir `"Auditoría"` a `MANAGEABLE_MODULES` en `useRolePermissions.ts`.
   - Añadir a `ROUTE_TO_MODULE`: `"/audit"` y `"/activity"` → `"Auditoría"`.
   - Migración seed: `INSERT ... role_permissions ('admin'|'administrativo','Auditoría','full') ON CONFLICT DO NOTHING` (verificar shape real de la tabla antes).

9. **N9 — Botón Actualizar en Calendario** — en `CalendarPage.tsx`, botón "Actualizar" que invalida `bookingKeys.all`.

10. **N11 — Motivo de cancelación**
    - Migración que actualiza `cancel_booking(p_booking_id, p_reason text DEFAULT NULL)`; append en `status_logs` con motivo.
    - Diálogo de cancelación pide textarea requerido cuando la nueva status es `cancelled`.

11. **N12 — Test aclaratorio (opcional pero incluido)** — 1 test en `rentalCalculation.test.ts`.

12. **N13 — Persister sin pending queries** — en `src/lib/query/persister.ts` `shouldPersistQuery`: early return si `query.state.status === "pending"`.

### Cierre

- `bun run lint` + `bun run test` + `bash scripts/arch-check.sh` + `deno fmt --check` en `supabase/functions`.
- Bump a **v7.222.0** en `package.json`, `public/version.json`, `public/changelog.json`, `public/changelog/v7.222.0.json`.

## Notas técnicas

- N1: preservo idempotencia, rango temporal y valida negocio actual. Si el negocio quiere que `minor_damage` también vaya a mantenimiento, se ajusta en un follow-up.
- N3: `adminOnly` de `/bookings/new` se documenta pero no se toca (evita regresión de producto).
- N8/N10: antes de escribir el seed, valido el shape de `role_permissions` con `supabase--read_query`.
