## Objetivo
Renombrar el módulo **Cuentas por Pagar** → **Facturas de Proveedor** en toda la app, incluyendo la clave de permisos en BD.

Se mantiene la URL `/cuentas-por-pagar` (no se cambia ruta para no romper bookmarks, links de cash-flow, audit logs ni redirects de `/expenses`). Solo cambian etiquetas visibles y la clave de módulo de permisos.

## Cambios

### 1. Migración SQL (BD)
Renombrar la clave de módulo en `role_permissions`:
```sql
UPDATE public.role_permissions
SET module = 'Facturas de Proveedor'
WHERE module = 'Cuentas por Pagar';
```
Solo afecta filas con la clave vieja (2 filas según verificación). No hay constraint NOT NULL que rompa.

### 2. Frontend — clave de módulo (RoleGuard, mapeo y catálogo)
Reemplazar el string literal `"Cuentas por Pagar"` por `"Facturas de Proveedor"` en:
- `src/routes/routes-config.tsx` (campos `module` de las dos rutas).
- `src/features/users/hooks/useRolePermissions.ts` (lista de módulos y mapeo de rutas).
- `src/features/cash-flow/pages/CashFlowPage.tsx` (`RoleGuard module=`).
- `src/features/bank-reconciliation/pages/BankReconciliationPage.tsx` y `BankAccountsPage.tsx`.
- `src/features/accounts-payable/components/SupplierBillDetailSheet.tsx`.
- `src/features/audit/lib/activityConstants.ts` (etiquetas de `supplier_bills` y `supplier_bill`).

### 3. UI visible (etiquetas, títulos, sidebar, atajos)
- `src/layouts/sidebar/navConfig.ts`: `title: "Facturas de Proveedor"`.
- `src/features/accounts-payable/pages/CuentasPorPagarPage.tsx`: `title="Facturas de Proveedor"`.
- `src/lib/shortcuts/registry.ts`: `label: "Facturas de Proveedor"` (atajo `g a` se conserva).
- `src/features/operations/components/operations/CxpApprovalTab.tsx`: `CardTitle` → `"Aprobación de Facturas de Proveedor"`.
- `src/features/accounts-payable/pages/AgingReportPage.tsx`: ajustar título si dice "Cuentas por Pagar" (verificar al editar).

### 4. Changelog
Nueva entrada `v6.81.0` (minor — rename de módulo, no rompe URLs ni datos pero cambia clave de permisos).

## Fuera de alcance
- No se cambia la URL `/cuentas-por-pagar` ni la carpeta `src/features/accounts-payable`.
- No se renombra el componente `CuentasPorPagarPage` ni los hooks `useAccountsPayableKpis` etc. (nombres internos, no visibles).
- No se modifican entradas de changelog históricas.
- No se tocan tablas `supplier_bills` ni `supplier_payments`.

## Detalles técnicos
- Orden: primero migración SQL (requiere aprobación), luego edits de frontend. La clave nueva en BD debe existir antes de que se hagan deploys de frontend para que `useRolePermissions` no muestre módulo huérfano.
- Verificación: tras el rename, los usuarios admin siguen viendo el módulo; revisar `/usuarios` no muestre clave vieja.
