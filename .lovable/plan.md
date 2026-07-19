# Ronda 3 BL-35…BL-45 · Plan de ejecución por sprints

Orden por dependencia (ISSUE-006 requiere ISSUE-002 primero) e impacto visible al cliente.

---

## Sprint 1 · ISSUE-001 (BL-43/44/45) — Cartera / Portal / Resumen respetan NCs y estatus
**Versión:** v7.99.0 · **Severidad:** Crítica

**Cambios**
- Migración única:
  - `v_invoices_with_balance`: agrega `credited_amount` (suma de `credit_notes.total` con `cancellation_status <> 'accepted' AND status <> 'cancelled'`) y `balance = GREATEST(total − paid − credited, 0)`. Conserva `security_invoker`, COMMENT y GRANTs.
  - `get_customer_summary`: `outstanding_revenue = SUM(balance)` de la vista con `status IN ('sent','partial','overdue')`.
  - `get_portal_invoices`: excluye `draft`/`cancelled`, devuelve `credited_amount` y `balance` calculados con la misma regla NC.
- Front: `PortalStatement.tsx` usa `balance` del RPC en vez de recalcular `total − paid`.

**Tests**
- RPC: factura $100k + NC total → balance 0 en los 3 consumidores.
- RPC: factura cancelada → fuera del portal, no suma en outstanding.
- RPC: pago parcial → outstanding = remanente.
- Vitest sobre `PortalStatement` con fixture que incluya NC.
- Test RLS del portal sigue verde.

**Entregable:** 1 migración + 1 archivo front + 3 tests + `v7.99.0.json`.

---

## Sprint 2 · ISSUE-002 (BL-39) — Bitácora append-only + revert seguro
**Versión:** v7.100.0 · **Severidad:** Crítica (compliance)

**Cambios**
- Migración:
  - `DROP POLICY "Admins full access audit_logs"` + `CREATE POLICY` SELECT-only para admin (INSERT sigue vía `audit_trigger_fn` SECURITY DEFINER).
  - `revert_audit_log` reescrita: whitelist sin `bookings/invoices/payments`; reemplaza el `DELETE` del asiento original por un INSERT compensatorio (`action='REVERT'`, `changed_by=auth.uid()`).
- Front:
  - Elimina `useDeleteAuditLog` y el botón "Eliminar" en `AuditTrailPage`.
  - `useRevertAuditLog`: mensaje "Se registró la reversa en la bitácora".

**Tests**
- RLS: DELETE de admin sobre `audit_logs` → denegado.
- Revert de `customers`: restaura valores, conserva original, aparece asiento REVERT.
- Revert de `payments` / `invoices` / `bookings`: excepción "tabla no permitida".

**Entregable:** 1 migración + 2 archivos front + 3 tests + `v7.100.0.json`.

---

## Sprint 3 · ISSUE-003 (BL-35/36) + ISSUE-004 (BL-37) — Fiscal & anti-lockout
**Versión:** v7.101.0 · **Severidad:** Alta

**Cambios**
- `parse-cfdi-expense/cfdi-parser.ts`: extraer `receptor_rfc` (`cfdi:Receptor@Rfc`) y `tipo_comprobante` (`Comprobante@TipoDeComprobante`).
- `parse-cfdi-expense/index.ts`: rechazar con 400 si `tipo_comprobante <> 'I'` o si `receptor_rfc` ≠ `company_settings.rfc` (case-insensitive) antes de cualquier insert.
- `delete-user/index.ts` y `toggle-user-status/index.ts`: guarda "último admin activo" (cuenta `user_roles.role='admin'` cruzado con `profiles.is_active=true`, excluyendo al objetivo; si 0 → 400).

**Tests Deno**
- Parser: dos campos nuevos + caso feliz + rechazos por tipo y por RFC.
- `delete-user` / `toggle-user-status`: 1-admin bloquea, 2-admins permite (ambas funciones).

**Entregable:** 3 edge functions + 4 archivos de test + `v7.101.0.json`.

---

## Sprint 4 · ISSUE-005 (BL-40/41) — Mantenimiento recurrente idempotente y sin gasto anticipado
**Versión:** v7.102.0 · **Severidad:** Alta (P&L)

**Cambios**
- `generate-recurring-maintenance/index.ts`:
  - Insertar log con `work_status: 'scheduled'` (agregar valor al enum si aplica).
  - Claim atómico por póliza ANTES del insert:
    ```
    UPDATE maintenance_policies
       SET last_generated_month = $mes
     WHERE id = $1
       AND (last_generated_month IS NULL OR last_generated_month < $mes)
     RETURNING id
    ```
    Si no devuelve fila → skip (otra corrida ya la tomó).
- Migración: verificar que `get_income_statement` (CTE `maint_by_month`) filtre por `work_status='completed'`; ajustar si falta.

**Tests Deno**
- Doble corrida en el mismo mes → 1 solo log por póliza.
- Log recién creado como `scheduled` no aparece en P&L; al pasarlo a `completed` sí.

**Entregable:** 1 edge function + (posible) 1 migración + 2 tests + `v7.102.0.json`.

---

## Sprint 5 · ISSUE-006 (BL-38) + ISSUE-007 (BL-42 + horómetro) — Cierre
**Versión:** v7.103.0 · **Severidad:** Media/Baja · **Depende de Sprint 2**

**Cambios**
- `delete-user/index.ts`: verificar errores de `user_roles.delete` y `profiles.delete` antes de `auth.admin.deleteUser` (400 sin tocar cuenta auth si fallan).
- Registrar en `audit_logs` (`action='ADMIN_ACTION'`, `table_name='auth.users'`, `new_data={action, target_user}`, `changed_by=auth.userId`) para: `delete-user`, `toggle-user-status`, `reset-user-password`, `invite-user`.
- `generate-recurring-maintenance`: cálculo de mes en `America/Monterrey` (mismo helper que `generate-recurring-invoices`).
- `PostDeliveryPickupDialog` / `PostBookingDeliveryDialog`: validación en form `hoursReading >= horas de entrega` con mensaje claro.

**Tests**
- Deno: fallo simulado en `profiles.delete` → 400, auth user intacto.
- Deno: cada acción admin genera asiento en bitácora.
- Deno: `generate-recurring-maintenance` calcula mes MTY correcto en borde de medianoche UTC.
- Vitest: diálogos rechazan horómetro < entrega.

**Entregable:** 4 edge functions + 2 diálogos + tests + `v7.103.0.json`.

---

## Reglas transversales
- Cada sprint termina con: migraciones aplicadas, `deno fmt --check` limpio, `bunx vitest run` verde, entrada en `public/changelog.json` + `public/changelog/vX.Y.Z.json`.
- Ronda de auditoría entre sprints (bugs + tests faltantes) antes de arrancar el siguiente, como hicimos en Ronda 2.
- Si algún sprint destapa un hallazgo colateral no listado, se documenta y se decide antes de tocarlo.

## Total estimado
5 sprints · ~5 migraciones · ~10 edge functions/front · ~18 tests nuevos · 5 entradas de changelog (v7.99.0 → v7.103.0).
