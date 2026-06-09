# PR 4 — Aprobaciones de Cuentas por Pagar

Bloquear el pago de facturas de proveedor que superen un umbral configurable hasta que un Admin las apruebe. Toda aprobación/rechazo queda registrado con usuario, fecha y comentario.

## Alcance

### 1. Configuración del umbral
- Nueva fila en `company_settings` (o columna nueva si la tabla es key-value): `cxp_approval_threshold_mxn` (numeric, default `10000`).
- UI en `Configuración de Empresa` → sección "Cuentas por Pagar" con un input MXN editable solo por Admin.
- Reglas:
  - Bills con `total_mxn ≤ umbral` → quedan `pending` y se pueden pagar directo.
  - Bills con `total_mxn > umbral` → quedan en nuevo estado `awaiting_approval` y bloquean el botón "Registrar Pago".
  - `total_mxn` = `total` si `currency='MXN'`, si no `total * exchange_rate`.

### 2. Esquema
- Extender enum `supplier_bill_status` con `awaiting_approval` y `rejected`.
- Columnas nuevas en `supplier_bills`:
  - `approval_status` enum (`not_required`, `pending`, `approved`, `rejected`) default `not_required`.
  - `approved_by uuid` (FK profiles), `approved_at timestamptz`, `approval_notes text`.
- Nueva tabla `supplier_bill_approvals` (bitácora completa, incluye reversiones):
  - `id`, `bill_id`, `actor_id`, `action` (`requested`, `approved`, `rejected`, `reset`), `notes`, `created_at`.
- Trigger BEFORE INSERT/UPDATE en `supplier_bills` que setea `approval_status` según umbral vs `total_mxn`.

### 3. RPCs
- `approve_supplier_bill(bill_id, notes)` — solo Admin; valida estado `awaiting_approval`; setea `approved`, libera para pago, inserta en bitácora, emite evento `activity_feed`.
- `reject_supplier_bill(bill_id, notes)` — solo Admin; notes obligatorio; pasa a `rejected` (no pagable); bitácora + activity_feed.
- `request_bill_reapproval(bill_id)` — Administrativo/Admin; de `rejected` vuelve a `awaiting_approval` para reintento tras corrección.
- `register_supplier_payment` existente: añadir validación que rechace si `approval_status IN ('pending','rejected')`.

### 4. UI — `/cuentas-por-pagar`
- Filtro adicional "Estado de aprobación" (Todos / Por aprobar / Aprobadas / Rechazadas / No requiere).
- Badge en lista y detalle: `Por aprobar` (amber), `Aprobada` (green outline), `Rechazada` (destructive), `No requiere` (muted).
- `SupplierBillDetailSheet`:
  - Sección "Aprobación" con botones `Aprobar` / `Rechazar` (solo Admin, solo si `awaiting_approval`).
  - Botón "Solicitar reaprobación" si `rejected` (Admin/Administrativo).
  - Timeline de aprobaciones (lectura desde `supplier_bill_approvals`).
  - El botón "Registrar Pago" se deshabilita con tooltip "Requiere aprobación" cuando aplica.

### 5. KPI nuevo
- `AccountsPayableKpiCards`: tarjeta "Por aprobar" (cantidad + total MXN) que filtra al listado.

### 6. Bitácora y auditoría
- `activity_feed`: `supplier_bill.approval_requested`, `.approved`, `.rejected`, `.reapproval_requested` con traducciones es-MX.
- Audit trail: añadir `supplier_bill_approvals` a tablas con diff row-level.

### 7. Permisos
- `role_permissions`: módulo "Aprobaciones CxP" — Admin full, Administrativo create-only (request_reapproval), Auditor read.

### 8. Tests
- Trigger: bill creado por debajo del umbral → `not_required`; por encima → `pending`.
- RPC `approve_supplier_bill` rechaza no-admin (403 / RLS).
- `register_supplier_payment` falla con `awaiting_approval` y `rejected`.
- KPI "Por aprobar" excluye `cancelled`.
- Cambio de umbral no reclasifica facturas existentes (decisión: solo aplica a nuevas).

### 9. Changelog
- `v6.29.0` (minor): "Aprobaciones de Cuentas por Pagar".

## Fuera de alcance
- Aprobaciones multi-nivel (jerárquicas por rangos de monto).
- Notificaciones push/email a aprobadores.
- Aprobación delegada o por sustitución temporal.
- Reclasificación retroactiva al cambiar el umbral.

## Notas técnicas

```text
supabase/migrations/<ts>_cxp_approvals.sql
  - ALTER TYPE supplier_bill_status ADD VALUE 'awaiting_approval', 'rejected'
  - ALTER TABLE supplier_bills ADD approval_status, approved_by, approved_at, approval_notes
  - CREATE TABLE supplier_bill_approvals + GRANTs + RLS (has_role admin/administrativo/auditor)
  - CREATE FUNCTION set_bill_approval_status() trigger
  - CREATE FUNCTION approve_supplier_bill / reject_supplier_bill / request_bill_reapproval (SECURITY DEFINER, SET search_path=public)
  - ALTER FUNCTION register_supplier_payment: bloquea si approval_status pending/rejected

src/features/accounts-payable/
  components/BillApprovalSection.tsx
  components/ApproveBillDialog.tsx
  components/RejectBillDialog.tsx
  hooks/useBillApprovalMutations.ts
  hooks/useBillApprovalHistory.ts
  lib/supplierBillConstants.ts          # + APPROVAL_STATUS_LABELS

src/features/company-settings/
  components/CxpApprovalThresholdCard.tsx
  hooks/useCxpApprovalThreshold.ts
```

- El umbral se evalúa en MXN normalizado para consistencia entre USD/MXN.
- `awaiting_approval` se considera deuda viva en aging y KPIs (cuenta como pendiente).
- Bills creados vía CFDI parser siguen el mismo flujo (el trigger aplica antes del INSERT).
