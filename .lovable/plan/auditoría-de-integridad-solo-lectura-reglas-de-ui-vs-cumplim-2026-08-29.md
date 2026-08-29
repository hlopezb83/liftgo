# Auditoría de integridad (solo lectura): reglas de UI vs. cumplimiento en backend

Sin cambios de código, SQL ni configuración. Todo lo siguiente se verificó leyendo el código actual y consultando el catálogo de la base de datos (definiciones de funciones, triggers y policies vigentes).

## 1. Clientes — archivar con rentas activas y/o saldo pendiente

- **Regla en UI:** `CustomerDeleteDialog.tsx` bloquea si `outstanding > 0` **o** `activeBookingsCount > 0` (oculta el botón confirmar); `useCustomerDetailActions.handleDelete` repite la precomprobación de rentas activas y sólo entonces llama al RPC `soft_delete_customer`.
- **Backend:** **PARCIAL**.
  - `public.soft_delete_customer(p_customer_id)` (SECURITY DEFINER, `search_path=public`) exige rol admin/administrativo y lanza *"No se puede archivar: el cliente tiene reservas activas"* si existe booking en `confirmed`/`in_progress`. Marca `deleted_at`/`deleted_by`.
  - **El saldo pendiente NO se valida en ningún lado del backend.** Es regla de producto exclusiva de la UI.
  - Además, las policies de `customers` son `FOR ALL` para admin, administrativo y **ventas**; los triggers de la tabla (`trg_customer_archive_unlink_user`, `bump_version_optimistic`, auditoría) no bloquean nada. Un `UPDATE customers SET deleted_at = now()` directo desde el cliente **salta por completo** el guard de rentas activas.
- **Impacto de bypass:** medio-alto. Cliente archivado con rentas en curso (rompe flujo operativo y listados) o con saldo vivo (riesgo de cobranza perdida). El dato no se destruye (soft delete) y queda en `audit_logs`.
- **Recomendación:** ALIGN BOTH.
  - Trigger `BEFORE UPDATE OF deleted_at ON customers` que reaplique la regla de rentas activas salvo cuando venga del RPC (patrón `set_config('app.customer_rpc','on',true)` ya usado en `assign_forklift_to_sale_quote`).
  - Decidir explícitamente si "saldo pendiente" es regla dura: si lo es, agregarla al RPC + trigger; si no, degradar la UI a advertencia en vez de bloqueo.
- **Pruebas:** no hay smoke SQL para `soft_delete_customer`. Falta: rentas activas rechazadas, saldo pendiente (según decisión), y bypass por UPDATE directo.

## 2. Cotizaciones de venta — facturar/convertir sin unidades asignadas

- **Regla en UI:** `useQuoteSaleAssignmentStatus` calcula por línea `assigned < required`; `QuoteDetail.tsx` hace `canInvoice = !isSale || assignmentStatus.isComplete`.
- **Backend:** **NO** para facturación; **PARCIAL** para conversión a reservas.
  - Ninguna función/trigger de la base referencia `quote_assigned_forklifts` como precondición para crear facturas (sólo lo usan `assign_forklift_to_sale_quote`, `unassign_forklift_from_sale_quote`, `delete_quote_with_unassign`, reportes y utilidades E2E). Una factura puede insertarse sin unidades asignadas.
  - `convert_quote_to_bookings` sí valida rol, estado `accepted`, no convertida previamente, vigencia y **al menos una** asignación (`jsonb_array_length(p_assignments) = 0` → error), pero **no verifica que la cantidad asignada cubra las líneas**.
  - `assign_forklift_to_sale_quote` sí es estricto en su propio ámbito (tipo venta, estado aceptado, unidad no vendida/archivada, sin renta abierta, marca `sold` y registra `status_logs`).
- **Impacto de bypass:** medio. Venta facturada sin unidad asignada → inventario no marcado como vendido, trazabilidad de series/activos rota; sin impacto fiscal directo (el CFDI se timbra igual).
- **Recomendación:** ADD BACKEND GUARD (regla de completitud) donde exista un punto único de facturación; si la factura se crea por INSERT directo, el guard natural es un trigger `BEFORE INSERT ON invoices` cuando la factura referencia una cotización de venta.
- **Pruebas:** existen pruebas de asignación (`useQuoteAssignments.rls.test.ts`, `useUnassignForklift.test.ts`). Falta cobertura de "facturar venta sin asignación completa".

## 3. Conciliación bancaria — bloqueo por `exact_amount`

- **Regla en UI:** `BankMatchCandidateList.tsx` deshabilita el botón cuando `!c.exact_amount`.
- **Backend:** **SÍ**, y es más estricto que la UI.
  - `confirm_bank_match` (SECURITY DEFINER, `search_path=public`) exige admin/administrativo, exactamente un pago, línea en `unmatched`/`suggested` con `FOR UPDATE`, coherencia de signo, conversión de moneda con tipo de cambio válido y **`ABS(monto_línea - monto_pago) > 0.01 → excepción`**.
  - `confirm_bank_matches` (masivo) delega en la misma función.
- **Impacto de bypass:** ninguno. La base rechaza el match inexacto.
- **Recomendación:** KEEP UI ONLY (el bloqueo es legítimo y refleja fielmente la regla del servidor). Único ajuste sugerido, opcional: convertir el `disabled` a bloque explicable con la razón real (tolerancia de 0.01 / moneda sin TC), no relajarlo.
- **Pruebas:** `useBankLineActions.test.ts` cubre el cliente; `supabase/tests/r_fix11_conciliacion_smoke.sql` cubre el área. Falta caso explícito "monto no exacto rechazado por el RPC".

## 4. Mantenimiento — archivar OT cerrada sólo admin

- **Regla en UI:** `MaintenanceDetailSheet.tsx` → `archiveBlocked = isClosed && !canArchiveClosed`, con `title` nativo.
- **Backend:** **SÍ**. `soft_delete_maintenance_log` exige admin/administrativo para archivar y, si `work_status = 'completed'`, **exige admin** con el mismo mensaje. Además protege el histórico de costos: sólo borra `maintenance_parts`/`maintenance_labor` de órdenes no cerradas.
- **Impacto de bypass:** bajo por el RPC. Matiz: `maintenance_logs` tiene policies `FOR ALL` para admin y **mechanic**, sin trigger que impida un `UPDATE ... SET deleted_at` directo; un mecánico podría marcar `deleted_at` sin pasar por el RPC.
- **Recomendación:** KEEP UI ONLY para el flujo normal + (opcional, P2) trigger `BEFORE UPDATE OF deleted_at ON maintenance_logs` que replique la regla, cerrando la ruta directa.
- **Pruebas:** `useMaintenanceLogs.test.ts` prueba que se invoca el RPC. Falta smoke SQL de rol (mecánico/administrativo vs. OT cerrada) y del bypass por UPDATE.

## 5. CxP — eliminar pago de proveedor con REP recibido o factura cancelada

- **Regla en UI:** `useSupplierPaymentActions` → `deleteBlock` si `rep_status === 'received'` o `billCancelled`; `canDelete = isAdmin && !deleteBlock`. `useDeleteSupplierPayment` hace `.delete()` directo sobre `supplier_payments`.
- **Backend:** **NO**.
  - Triggers de `supplier_payments`: `trg_clear_bill_payment_in_progress` (AFTER INSERT), `trg_enforce_supplier_payment_balance` (BEFORE INSERT/UPDATE de amount/bill_id), `trg_round_supplier_payment_amount`, `trg_sp_set_rep_required` (BEFORE INSERT) y `trg_sp_recalc_aiud` (recalculo AFTER I/U/D). **Ningún guard BEFORE DELETE.**
  - Policy: `SupPay: admin/administrativo full` es `FOR ALL` → **administrativo también puede borrar** aunque la UI lo restrinja a admin, y puede borrar un pago con REP recibido o con factura cancelada.
- **Impacto de bypass:** alto (fiscal/financiero). Se elimina un pago que ya tiene complemento de pago (REP) recibido/timbrado del proveedor → descuadre entre CFDI recibidos y pagos registrados, saldo de la factura recalculado hacia arriba y línea bancaria conciliada desvinculada (`ON DELETE SET NULL`).
- **Recomendación:** ADD BACKEND GUARD (el hallazgo más serio de esta auditoría).
  - Función `guard_supplier_payment_delete()` + trigger `BEFORE DELETE ON supplier_payments`: rechazar si `rep_status IN ('received','stamped')`, si la factura padre está cancelada, y (opcional) exigir rol admin, alineando con la UI.
  - Considerar además exigir desconciliar la línea bancaria antes de borrar, en vez de desvincularla en silencio.
- **Pruebas:** `supabase/tests/rls/supplier_payments.sql` y `r_fix09_cxp_smoke.sql` cubren acceso, no la regla de borrado. Falta smoke SQL del DELETE bloqueado y prueba de que administrativo no puede borrar.

## 6. CRM — cerrar prospecto como Ganado

- **Regla en UI:** `prospectCloseRules.ts` (`canCloseAsWon`: etapa `negociacion` + permiso admin/administrativo, `isValidFinalAmount > 0`) y `useProspectGuard` con toast de acceso restringido.
- **Backend:** **SÍ**, completo y en dos triggers:
  - `validate_prospect_stage_transition`: sólo `nuevo_prospecto` al insertar; prospecto cerrado no cambia de etapa; `cerrado_ganado` sólo desde `negociacion` (`check_violation`).
  - `validate_prospect_close`: exige `final_amount > 0`; exige rol admin/administrativo (`insufficient_privilege`), omitiéndolo cuando no hay sesión (service_role/tareas) o durante el sembrado E2E; exige `lost_reason` para perdido y normaliza `closed_at`.
- **Impacto de bypass:** ninguno para integridad; saltarse la UI sólo produce un error SQL crudo.
- **Recomendación:** KEEP UI ONLY (la UI es un espejo fiel). Nota de fragilidad: el mapeo del error a copy en español depende de coincidencia de texto del mensaje; cambiar el texto en una migración rompería el bloque explicable en silencio. Preferible a futuro discriminar por `ERRCODE` (`check_violation` vs `insufficient_privilege`) en vez de regex de texto.
- **Pruebas:** `supabase/tests/g_c2_prospect_close_role_smoke.sql` verifica el guard de rol, `(select auth.uid())`, `search_path` y la existencia del trigger; `prospectCloseRules.test.ts` cubre el lado cliente. Falta una prueba que fije el contrato del mensaje/errcode usado por el mapeo de UI.

## Ranking por riesgo de integridad

| Prioridad | Hallazgo | Tipo |
| --- | --- | --- |
| **P0** | CxP: `DELETE` de `supplier_payments` sin guard de REP recibido ni de factura cancelada; además administrativo puede borrar pese a la UI admin-only | Integridad fiscal/financiera real |
| **P1** | Clientes: `UPDATE customers.deleted_at` directo salta el guard de rentas activas del RPC | Integridad de datos |
| **P1** | Cotizaciones de venta: facturar sin asignación completa de unidades no está impedido en backend | Integridad de inventario/trazabilidad |
| **P2** | Clientes: bloqueo por saldo pendiente existe sólo en UI | Inconsistencia de política de producto |
| **P2** | Mantenimiento: `UPDATE maintenance_logs.deleted_at` directo (mechanic) salta la regla del RPC | Integridad menor |
| **P2** | CRM: mapeo de error por texto en vez de `ERRCODE` | Fragilidad de UX, sin riesgo de integridad |
| **OK** | Conciliación bancaria (`exact_amount`) y archivo de OT cerrada vía RPC: backend ya lo impone | Sin acción |

## Nota de alcance

Esta es la entrega de la auditoría; no propone ejecutar cambios. Si quieres, el siguiente paso natural sería un plan de implementación acotado sólo para el P0 (trigger `BEFORE DELETE` en `supplier_payments`) con su smoke SQL.
