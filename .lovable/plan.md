
# Lote R4 — Bugs de uso (E2E) + pendientes de código

Base: `main @ v7.144.0`. Trabajo en orden por bloque. Cada bloque cierra con changelog (patch o minor) y verificaciones (`bun run test`, `deno test supabase/functions`, `tsc --noEmit`).

---

## 🔴 Bloque 1 — Timezone (un fix, tres síntomas) → v7.145.0

**Root cause**: `formatMtyDate` usa `new Date("YYYY-MM-DD")` que se interpreta como UTC medianoche; al mostrar en `America/Monterrey` sale el día anterior. Afecta tooltip Gantt y Estado de Resultados (columnas etiquetadas MAR–JUN cuando se piden ABR–JUL).

- **1.1** `src/lib/utils.ts` y `src/lib/format/dateFormats.ts`: dentro de `formatMtyDate` (y `formatDateTimeMty` cuando el input sea `YYYY-MM-DD`) usar `parseDateLocal` en lugar de `new Date(str)`. Para `month_key "2026-04"` construir `parseDateLocal(`${monthKey}-01`)`.
- Unificar: `formatDateDisplay` (correcto) y `formatMtyDate` (roto) comparten parseo seguro.
- **Tests**: `formatMtyDate("2026-06-06") === "06/06/2026"` con TZ del proceso en `America/Monterrey` **y** en `UTC`.

---

## 🔴 Bloque 2 — Altos de uso → v7.146.0

- **2.1** `CustomerFormDialog.tsx` footer: `disabled={isPending}` en submit. Grep de otros diálogos con botón de submit propio que reciban `isPending` sin usarlo. Verificación: doble click → 1 registro.
- **2.2** `ForkliftMaintenanceList.tsx:112`: null-guard antes de `parseDateLocal` (fallback `"—"`) y endurecer `parseDateLocal` (`src/lib/utils.ts:11`) para devolver `null` ante input null/undefined en lugar de lanzar. Test unitario de `parseDateLocal(null)`.
- **2.3** Layout del portal (`CustomerPortalLayout`): tabs con `overflow-x-auto` + `shrink-0`; raíz con `max-w-full overflow-x-clip`. Verificar en 390px: sin scroll horizontal del documento, todas las tabs alcanzables.

---

## 🟡 Bloque 3 — Portal del cliente → v7.147.0

1. `PortalQuoteDetail`: "IVA (0.16%)" → multiplicar tasa × 100 al formatear.
2. Badge de cotización `sent` mostrando "Sin Pagar": mapa propio de estados de cotización (`Enviada / Aceptada / Rechazada / Vencida`), no reusar el de facturas.
3. Cotización vencida (`valid_until < hoy`): ocultar/deshabilitar "Aceptar cotización" con aviso; añadir validación server-side en el RPC de aceptación si falta.
4. `ReportTransferDialog`: validar `amount <= balance` con mensaje claro.
5. Input file nativo: label en español ("Elegir archivo / Ningún archivo").
6. `/quotes`: mapa incluye `declined` pero el status real es `rejected`; añadir clave correcta + fallback `"—"` para estados desconocidos.
7. Tipos de servicio de mantenimiento: crear `SERVICE_TYPE_LABELS` es-MX y usarlo en lista y kanban.

---

## 🟡 Bloque 4 — Formularios y tablas admin → v7.148.0

1. `CustomerFormDialog`: verificar integración de `src/lib/forms/zodResolver.ts` con `FormMessage`/`TextField` para que los errores se pinten bajo el campo.
2. `useCustomersColumns.tsx`: celda nombre con `max-w-[280px] truncate` + tooltip completo.
3. `src/components/forms/FormDialog.tsx:80`: `pb-*` al cuerpo scrollable para que footer sticky no tape inputs.
4. `useUnsavedChangesGuard`: interceptar `onOpenChange` del diálogo (ESC/overlay) cuando `isDirty`.
5. `GanttRow.tsx:51`: barra de reserva con `cursor-pointer` + navegación al detalle.

---

## 🔵 Bloque 5 — Bajos → v7.149.0

1. ⌘K: indexar facturas/clientes/reservas (número/folio/nombre), no solo páginas.
2. `src/features/users/lib/queryKeys.ts:42`: eliminar fallback silencioso a `"dispatcher"`; mostrar "Sin rol" con estilo advertencia.
3. `$NaN` en cash-flow: sanitizar `billToItem` (null → 0 o "—") y `formatCurrency` (NaN → "—").
4. `invite-user/index.ts:77-79`: tras upsert de rol, `DELETE FROM user_roles WHERE user_id = $1 AND role <> $2` para no acumular `customer` + rol interno.
5. `version.json`: gitignore o check de build que falle si difiere de `changelog.json[0]`.

---

## 🟣 Bloque 6 — Hallazgos de código R4 → v7.150.0 (minor: DB + Edge)

1. `stamp-payment-complement/index.ts:176`: el early return `if (!apiKey)` debe llamar `releaseClaim("Facturapi key no configurada")`.
2. Trigger `BEFORE UPDATE` en `prospects`: rechazar `stage='cerrado_ganado'` y cambios de `final_amount`/`closed_at` si el actor no es admin/administrativo (`has_role`).
3. `customer_payment_intents`:
   - (a) Policy INSERT: `AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND i.customer_id = get_customer_id_for_user(auth.uid()))`.
   - (b) `approve_payment_intent`: validar lo mismo con `RAISE EXCEPTION` antes de insertar el pago.
4. `billing_secrets` write-only:
   - Eliminar policy SELECT admin (migración `20260515235356`).
   - RPC `set_billing_secrets(p_test_key, p_live_key)` SECURITY DEFINER con check admin.
   - `useUpsertBillingSecrets` usa el RPC.
5. `types.ts`: regenerar para incluir `mark_started_bookings_rented`.
6. Kanban CRM `stage_order = MAX+1`: índice único `(stage, stage_order)` o RPC con advisory lock por stage.
7. `useLiftgoTable.ts:118-123`: incluir `globalFilter` en la clave del `useMemo` o eliminar la opción.
8. `VirtualBody.tsx:38-49`: `useEffect(() => () => clearTimeout(timerRef.current), [])`.

---

## Reglas generales

- Migraciones: timestamps consecutivos nuevos, idempotentes, `SECURITY DEFINER` con `SET search_path = public`, GRANTs mínimos. No debilitar RLS ni fixes previos (claim atómico, guarda anti-stub, trigger de divisa, optimistic locking).
- Tests unitarios obligatorios: Bloque 1.1 (fechas) y 2.2 (`parseDateLocal(null)`). El resto: verificación manual documentada en el changelog.
- Al terminar cada bloque: `bun run test`, `deno test supabase/functions`, `tsgo --noEmit` en verde y entrada en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json`.

## Detalles técnicos

- **Numeración**: cada bloque = una versión. Bloques 1–5 patch/minor según impacto; bloque 6 minor (DB + Edge + policies).
- **Riesgo**: bloque 6.4 rompe cualquier consumidor actual de `.from('billing_secrets').select(...)` — refactor obligatorio en el mismo bloque.
- **Verificación no-regresión**: al terminar bloque 6, correr Playwright del portal y del flujo cotización→reserva→factura→pago.
