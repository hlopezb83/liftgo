
## Validación de los 5 bloques principales

| Bloque | Diagnóstico | Estado real |
|---|---|---|
| **B1** — Seed `role_permissions` para "Facturas de Proveedor" | ❌ **No es bug.** La DB ya tiene las 6 filas correctas (admin/administrativo=full, auditor=read, resto=none). La migración `20260624000723` renombra `'Cuentas por Pagar' → 'Facturas de Proveedor'` y el seed original (`20260313001007`) sí insertó `'Cuentas por Pagar'`. Verificado con `select` a la DB. Admin sí entra a CxP hoy. | **Skip** |
| **B2** — Guard cotizaciones vencidas + auditoría de aceptación | ✅ **Bug real.** No existe trigger `guard_quote_acceptance`. En `useQuoteConversionActions.setStatus` (línea 27) se hace `updateQuote.mutate({ id, status: 'accepted' })` sin poblar `accepted_at`/`accepted_by_user_id` (columnas ya existen; sólo el RPC del portal los llena). | **Fix** |
| **B3** — Reglas de transición de estado de flota | ✅ **Bug real.** `useUpdateStatus` hace UPDATE directo sin validar rentas activas. No existe RPC `change_forklift_status`. | **Fix** |
| **B4** — Selector de equipos en contratos | ❌ **Ya hecho** (R7 Bloque 18a en `useContractFormLogic.ts:22-27`). | **Skip** |
| **B5** — Unique fabricante+modelo en `equipment_models` | ✅ **Bug real.** `pg_indexes` sólo muestra PK y el índice de `e2e_scope`. No hay UNIQUE. | **Fix** |

**B6** (17 verify-items bajos) queda fuera de este plan; lo abordo en una siguiente ronda para no mezclar cambios masivos con los fixes críticos.

---

## Cambios a implementar

### 1. B2 — Guard de cotizaciones vencidas + auditoría interna

**Migración** (nuevo archivo `supabase/migrations/…_guard_quote_acceptance.sql`):
- Función `public.guard_quote_acceptance()` (SECURITY INVOKER, `SET search_path = public`) que en `BEFORE UPDATE` bloquea `NEW.status='accepted'` si `valid_until < current_date` y la transición viene de otro estado.
- Trigger `quotes_guard_acceptance BEFORE UPDATE ON public.quotes`.

**Código** (`src/features/quotes/hooks/quoteDetail/useQuoteConversionActions.ts`):
- En `setStatus`, cuando `status === 'accepted'`, obtener `auth.getUser()` y agregar `accepted_at: new Date().toISOString()` y `accepted_by_user_id` al `mutate`.
- Manejar error del trigger con `notifyError` legible ("La cotización ya venció").

### 2. B3 — RPC validador `change_forklift_status`

**Migración**:
- Función SECURITY DEFINER que:
  - `SELECT … FOR UPDATE` del forklift.
  - Cuenta bookings activas (`confirmed`, `active` — usar los estados reales del código: revisar `bookingStateMachine`).
  - Rechaza `→ rented` sin renta activa.
  - Rechaza salir de `rented` con renta activa.
  - Exige `p_reason` para `maintenance` / `sold` / `baja` (usar valores del enum real).
  - Actualiza `forklifts.status` e inserta `status_logs(from_status, to_status, note)`.
- `GRANT EXECUTE … TO authenticated`.

**Código** (`src/features/fleet/hooks/forklifts/useForkliftMutations.ts`):
- Reescribir `useUpdateStatus` para llamar `supabase.rpc('change_forklift_status', { p_forklift_id, p_new_status, p_reason })`. Quitar el `insert` a `status_logs` (lo hace la RPC).
- Firma del hook pasa a aceptar `reason` opcional.

**UI** (`StatusChangeCard.tsx` — localizar y ajustar):
- Deshabilitar opciones inválidas usando la misma matriz que la RPC (helper `isForkliftStatusTransitionAllowed(current, target, hasActiveBooking)`).
- Cuando `target ∈ { maintenance, sold, baja }`, exigir campo "Razón" antes de habilitar el botón "Guardar".
- Mostrar tooltip explicando por qué está deshabilitada la opción.

### 3. B5 — Unique fabricante+modelo en `equipment_models`

**Migración**:
- Detectar y consolidar duplicados existentes (mantener el más antiguo por `created_at`, actualizar referencias en `forklifts` si aplica — verificar FKs primero con `information_schema`).
- `CREATE UNIQUE INDEX IF NOT EXISTS equipment_models_mfr_model_unique ON public.equipment_models (lower(manufacturer), lower(model));` (sin `WHERE deleted_at` porque la tabla no tiene soft-delete — a confirmar).

**Código** (`EquipmentModelsTab.tsx`):
- Validar duplicado en cliente antes de guardar (misma UX que `validateForkliftUniqueness`), mostrando "Ya existe ese modelo para este fabricante".
- En el diálogo de eliminación, hacer `select count(*) from forklifts where equipment_model_id = …` (o combinación mfr+model si no hay FK) y mostrar "N montacargas usan este modelo".

### 4. Cierre
- Ejecutar `bun run lint` y `vitest run` (tests afectados: `useForkliftMutations.test.ts`, quotes hooks tests).
- Bump `public/version.json` y `public/changelog.json` a **v7.189.0** (minor: nuevas RPC + constraint + guardas).
- Entrada de changelog: describir sólo B2, B3, B5.

## Fuera de alcance de este plan
- B1 (no es bug — documentar en respuesta al usuario).
- B4 (ya implementado).
- B6 (17 bajos) — plan aparte tras aprobar éste.
