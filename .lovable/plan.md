## Auditoría R19 — Validación previa

Verifiqué cada finding contra el código actual. **Todos siguen vigentes** (algunas rutas cambiaron por refactors previos, pero el bug persiste).

| ID | Estado | Nota |
|---|---|---|
| R19-A (contracts) | Vigente | `form.watch()` en render en `useContractFormPrefill.ts:35-36` |
| R19-A (bill CxP) | Vigente | `form.watch("currency")` en `SupplierBillFormDialog.tsx:53` |
| R19-B | Vigente | `isPayable` no considera `cfdi.isCancelled` (`invoices.ts:74`) |
| R19-C | Vigente | RPC exige `= 'approved'` estricto (migr. `20260727213612`, línea 41) |
| R19-D | Vigente | `useDamagePrefill` no espera al catálogo `customers` |
| A-3b | Vigente | Nada actualiza `damage_records.status='invoiced'` tras crear factura |
| C-5 | Vigente | RPC no valida `p_hours_used < 0` |
| R19-3 | Vigente | `closedColumns.tsx` no muestra "Cliente creado" para won convertidos |
| Portal USD | Vigente | `PortalSections.tsx:57` usa `formatCurrency` sin código |
| R19-2 | Opcional | Sin índice único en `contracts.contract_number` |

## Plan de implementación (v7.240.2)

### Bloqueantes (ALTOS)

1. **R19-A · Fix RHF 7.83 + React 19 (`watch` → `useWatch`)**
   - `src/features/contracts/hooks/contractForm/useContractFormPrefill.ts`: reemplazar `form.watch("customer_id"/"forklift_id")` por `useWatch({ control, name })`.
   - `src/features/accounts-payable/components/SupplierBillFormDialog.tsx`: mismo patrón para `currency`.

2. **R19-B · Bloquear "Registrar Pago" en CFDI cancelado**
   - `src/lib/rules/invoices.ts`: mover cálculo de `cfdi` arriba de `isPayable`; agregar `&& !cfdi.isCancelled`.

3. **R19-C · Aceptar `not_required` en lote de pagos**
   - Nueva migración que recrea `create_supplier_payment_batch` (copiada íntegra de `20260727213612`) cambiando la línea 41 a `NOT IN ('approved', 'not_required')`.

4. **R19-D + A-3b · Damage prefill y cierre de ciclo**
   - `src/features/invoices/hooks/useDamagePrefill.ts`: aceptar `customers` como parámetro; retornar temprano si `!customers?.length` o `damageCustomerId === "null"`.
   - `src/features/invoices/pages/InvoiceForm.tsx`: pasar `f.customers` al hook; en `onSuccess` de `createInvoice` (rama `!isEdit`), tras `syncInvoiceBookings`, actualizar `damage_records.status='invoiced'` si venimos con `damage_id` válido.
   - `src/features/damage/components/damage/DamageActions.tsx`: `handleCreateInvoice` chequea `record.status==='invoiced'` y `record.customer_id` antes de navegar (con `notifyError`).

### Bajos (mismo release)

5. **C-5 · Guard de horas negativas**
   - En la misma migración de R19-C, recrear `complete_return_inspection` (copiada de `20260727213612`) agregando `IF p_hours_used < 0 THEN RAISE ...`.

6. **R19-3 · Indicador "Cliente creado" en /crm/cerrados**
   - `src/features/crm/lib/closedColumns.tsx`: al lado del botón Convertir, si `kind==='won' && p.customerId`, mostrar `<span>Cliente creado</span>`.

7. **Portal USD · Mostrar moneda**
   - `src/features/portal/components/PortalSections.tsx`: usar `formatCurrencyWithCode(total, moneda ?? 'MXN')`. Ampliar tipo `Invoice` con `moneda?: string | null`.

### Opcional

8. **R19-2 · Índice único en `contracts.contract_number`** (sólo si quieres blindaje contra doble-click ~100ms). Recomiendo incluirlo — es baratísimo y coherente con quotes (R17-D).

### Cierre

- Actualizar `public/changelog.json` (entrada v7.240.2) y crear `public/changelog/v7.240.2.json`.
- Correr `bun run lint` para validar.

**¿Confirmas todo (incluye R19-2 opcional) o excluyo el índice de contratos?**