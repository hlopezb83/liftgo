# Fase 2 — Proveedores Robustos (v6.34.0)

Endurece el módulo de Proveedores con datos relacionales que CxP y SPEI necesitan: múltiples contactos por proveedor, condiciones de pago default (días de crédito) y un catálogo reusable de cuentas bancarias (CLABE/banco/titular).

## Alcance

### A. Base de datos (1 migración)

**A1. `supplier_contacts`** (nueva tabla)
- Campos: `supplier_id` (FK), `name`, `role` (texto: "Cobranza", "Ventas", "Almacén", "Operaciones", "Dirección", "Otro"), `email`, `phone`, `is_primary` (bool), `notes`.
- Índice único parcial: un solo `is_primary=true` por `supplier_id`.
- RLS: read para `authenticated`; write para admin/administrativo/auditor (igual que `suppliers`).
- GRANT a `authenticated` y `service_role`.
- Trigger `updated_at`.
- **Migración de datos**: por cada `supplier` con `contact_person` o `email`/`phone`, insertar contacto primario con esos valores.

**A2. `suppliers.default_payment_terms_days`** (nueva columna `int`, nullable)
- Valores típicos: 0 (contado), 15, 30, 45, 60, 90.
- Sin enum: campo libre numérico con validación en UI (0–365).
- Backfill: deja en `NULL` (significa "sin default, usar el de la factura").

**A3. `supplier_bank_accounts`** (nueva tabla)
- Campos: `supplier_id`, `bank_name`, `account_holder`, `clabe` (text, 18 dígitos), `account_number` (text, opcional), `currency` (MXN/USD, default MXN), `is_primary` (bool), `notes`.
- Validación CLABE en trigger: longitud 18 + solo dígitos (no checksum por ahora).
- Índice único parcial: un solo `is_primary=true` por `supplier_id`.
- RLS y GRANTs idénticos a `supplier_contacts`.
- Trigger `updated_at`.

**A4. Auto-fill de `due_date` en `supplier_bills`**
- Trigger `BEFORE INSERT`: si `due_date IS NULL` y el supplier tiene `default_payment_terms_days`, calcular `due_date = issue_date + dias`.
- No sobreescribe due_date si ya viene asignada.

### B. Hooks de datos

- `useSupplierContacts(supplierId)` — list/create/update/delete con invalidaciones.
- `useSupplierBankAccounts(supplierId)` — idem.
- Extender `useSuppliers` para incluir `default_payment_terms_days` en `Supplier`.

### C. UI

**C1. `SupplierFormFields.tsx`**
- Agregar campo "Días de crédito (default)" tipo number, 0–365, opcional. Helper: "Se aplicará automáticamente al registrar una nueva CxP."

**C2. `SupplierDetailPage.tsx`** — dos nuevas tarjetas/secciones colapsables:
- **Contactos**: tabla compacta (Nombre, Rol, Email, Teléfono, Primario badge) + botón "Agregar" → `SupplierContactDialog` (nuevo).
- **Cuentas bancarias**: tabla compacta (Banco, Titular, CLABE enmascarada `****1234`, Moneda, Primario badge) + botón "Agregar" → `SupplierBankAccountDialog` (nuevo).
- Acciones drill-down: editar / marcar como primario / eliminar.

**C3. `SupplierBillFormDialog.tsx`**
- Al seleccionar supplier: cargar su `default_payment_terms_days`. Si existe y due_date está vacío, prefill `due_date = issue_date + días`. El usuario puede sobreescribir.
- Mostrar hint debajo del DatePicker: "Sugerido: <fecha> (proveedor a <N> días)".

### D. Tests

- `supplierContactsPrimary.test.ts` — solo un primario por proveedor (mock supabase).
- `supplierBankAccountClabe.test.ts` — valida regex CLABE en helper de UI.
- `supplierBillDueDate.test.ts` — verifica cálculo de due_date desde issue_date + términos.

### E. Changelog

- `public/changelog/v6.34.0.json` (minor — features nuevas no breaking).
- Update de `public/changelog.json`.

## Detalles técnicos

```text
SQL clave (resumen):

CREATE TABLE supplier_contacts (
  id uuid pk, supplier_id uuid FK suppliers,
  name text NOT NULL, role text, email text, phone text,
  is_primary boolean DEFAULT false, notes text,
  created_at, updated_at
);
CREATE UNIQUE INDEX supplier_contacts_one_primary
  ON supplier_contacts(supplier_id) WHERE is_primary;

ALTER TABLE suppliers ADD COLUMN default_payment_terms_days int;

CREATE TABLE supplier_bank_accounts (
  id uuid pk, supplier_id uuid FK suppliers,
  bank_name text NOT NULL, account_holder text NOT NULL,
  clabe text, account_number text,
  currency text DEFAULT 'MXN' CHECK (currency IN ('MXN','USD')),
  is_primary boolean DEFAULT false, notes text,
  created_at, updated_at
);
CREATE UNIQUE INDEX supplier_bank_accounts_one_primary
  ON supplier_bank_accounts(supplier_id) WHERE is_primary;

-- Trigger valida CLABE 18 dígitos si no es NULL.
-- Trigger en supplier_bills BEFORE INSERT prefill de due_date.
-- Backfill de contactos primarios desde columnas existentes.
```

## Fuera de alcance

- CSF de proveedores (PDF SAT) — siguiente sub-fase si lo aprueban.
- Generación de layouts SPEI (.txt bancario) — requiere catálogo, viene en Fase 3.
- Recordatorios de cobranza por email a contactos (Fase 4).
- Validación checksum CLABE (solo longitud por ahora).
- UI mobile para diálogos de contactos/cuentas (desktop-first como el resto del módulo).
