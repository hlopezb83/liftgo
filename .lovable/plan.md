# PR 7 — Conciliación bancaria

## Objetivo
Subir un estado de cuenta bancario en CSV, normalizar los movimientos y emparejarlos contra los pagos ya registrados (cobros de `payments` + pagos a proveedores de `supplier_payments`). Marcar cada movimiento como **conciliado**, **sugerido** o **sin emparejar**, con emparejamiento manual cuando la sugerencia no aplique.

Sin integración con APIs bancarias — sólo CSV manual. Multi-banco mediante un catálogo simple de cuentas.

## Alcance funcional

### Catálogo de cuentas bancarias
- Nueva tabla `bank_accounts` (nombre, banco, últimos 4 dígitos, moneda, saldo inicial opcional, activo).
- ABC mínimo en `/cuentas-bancarias` (Admin + Administrativo).

### Importación de estado de cuenta
- Página `/conciliacion-bancaria` con selector de cuenta bancaria y dropzone CSV.
- Parser cliente acepta formato estándar (fecha, descripción, monto, referencia). Soporta perfiles preconfigurados: **BBVA**, **Banorte**, **Santander**, **Genérico**.
- Detección de duplicados por hash (`account_id + fecha + monto + referencia`).
- Cada fila se inserta en `bank_statement_lines` con `status = 'unmatched'`.

### Motor de emparejamiento
- Al importar, una RPC `match_bank_statement_lines(account_id, date_window)`:
  1. Para cada línea de **cargo** (salida del banco): busca en `supplier_payments` (mismo importe ±$0.01, fecha ±3 días, cuenta destino opcional) → si hay un único candidato la marca `status = 'matched'` y guarda `matched_payment_id`. Si hay varios, `status = 'suggested'` y guarda el mejor en `suggested_payment_id`.
  2. Para cada línea de **abono** (entrada al banco): busca en `payments` (cobros a clientes) con la misma lógica.
- Score: importe exacto (60) + cercanía de fecha (0–25) + match parcial de referencia/folio en descripción (0–15).

### UI de conciliación
- Tabla con 3 secciones colapsables: **Sin emparejar**, **Sugeridas** (con botón "Confirmar"), **Conciliadas**.
- Click en una línea → side sheet con detalle del movimiento + candidatos manuales (buscador por monto/fecha/referencia) para emparejar.
- KPI: total cargos, total abonos, saldo del periodo, % conciliado.
- Acciones: "Confirmar sugerencia", "Emparejar manualmente", "Marcar como ignorada" (gasto bancario, comisión, etc.), "Desemparejar".
- `MobileCardList` en móvil.

### Indicadores cruzados
- En detalle de `payments` y `supplier_payments` mostrar badge "Conciliado el DD/MM/YYYY" cuando exista emparejamiento.

```text
[ Cuenta: BBVA •4521 ▾ ]  [ Subir CSV ]  [ Periodo: 01–31 May ]   42 / 58 conciliados (72%)

▾ Sin emparejar (12)
   05/05  -$12,450.00  PAGO PROV ACME      [Emparejar…]  [Ignorar]
▾ Sugeridas (8)
   07/05  -$ 8,300.00  TRANSFER 0012       → SP-2026-014 ($8,300, 07/05)  [Confirmar] [Otro…]
▾ Conciliadas (38)
   ...
```

## Cambios técnicos

### Migración
- `bank_accounts (id, name, bank, last4, currency default 'MXN', initial_balance numeric default 0, is_active bool default true)` + GRANTs + RLS por rol (Admin/Administrativo CRUD, Auditor read).
- `bank_statement_imports (id, bank_account_id, file_name, period_start, period_end, lines_count, imported_by)` para historial.
- `bank_statement_lines (id, import_id, bank_account_id, posted_date, description, amount, signed_amount, reference, hash, status enum 'unmatched'|'suggested'|'matched'|'ignored', matched_payment_id uuid, matched_supplier_payment_id uuid, suggested_payment_id, suggested_supplier_payment_id, match_score int, matched_at, matched_by, ignored_reason)` con índice único en `(bank_account_id, hash)`.
- RPC `public.match_bank_statement_lines(p_import_id uuid)` `SECURITY DEFINER SET search_path = public` con la lógica de scoring.
- RPC `public.confirm_bank_match(line_id, payment_id?, supplier_payment_id?)` y `public.unmatch_bank_line(line_id)`.

### Código nuevo
```
src/features/bank-reconciliation/
  pages/BankAccountsPage.tsx
  pages/BankReconciliationPage.tsx
  components/BankAccountFormDialog.tsx
  components/BankStatementUploader.tsx
  components/BankStatementLineRow.tsx
  components/BankLineDetailSheet.tsx
  components/ManualMatchPicker.tsx
  components/ReconciliationKpiCards.tsx
  hooks/useBankAccounts.ts
  hooks/useBankStatementLines.ts
  hooks/useBankReconciliationMutations.ts
  lib/csvParsers.ts                # perfiles BBVA / Banorte / Santander / Genérico
  lib/bankReconciliationConstants.ts
  lib/__tests__/csvParsers.test.ts
  lib/__tests__/matching.test.ts
```
Navegación: nuevo grupo "Tesorería" o reutilizar "Finanzas" con `Cuentas bancarias` y `Conciliación bancaria`.

### Tests
- Parser CSV de cada perfil (encabezados, formato de fecha, signo de monto, descripción multilínea).
- Dedupe por hash al re-importar el mismo CSV.
- Matching: caso 1 candidato exacto, múltiples candidatos (score), sin candidatos, fechas en frontera de ±3 días.

### Permisos
- `RoleGuard module="Cuentas por Pagar"` mínimo read; mutaciones (importar, confirmar, ignorar) requieren Admin o Administrativo.

### Changelog
`v6.32.0` (minor) — "Conciliación bancaria por CSV con emparejamiento automático".

## Fuera de alcance
- Integración directa con APIs de bancos (Open Banking / SAT) — fase posterior.
- Conciliación de tarjetas de crédito empresariales.
- Reglas personalizables de matching por el usuario.
- Sub-emparejamiento (una línea bancaria contra varios pagos parciales).
