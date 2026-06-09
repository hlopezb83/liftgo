# PR 3 — Consolidación de Gastos en Cuentas por Pagar

Cerrar la transición iniciada en PR 1 y PR 2: el módulo `/expenses` deja de ser la fuente operativa y se redirige hacia `/cuentas-por-pagar`. El parser CFDI se actualiza para crear `supplier_bills` directamente, y se añaden tres capacidades clave de control financiero: antigüedad de saldos, comprobante de pago subido a Storage y bitácora de actividad completa.

## Alcance

### 1. Migración del parser CFDI (`parse-cfdi-expense`)
- La edge function pasa a insertar en `supplier_bills` (no `operating_expenses`).
- Detecta duplicados por `cfdi_uuid` (índice único parcial ya existe) y devuelve la factura existente en lugar de crear una nueva.
- Toma de XML: UUID, RFC emisor → match a `suppliers` (auto-crea si no existe vía `link_rfc_to_supplier` ya disponible), fecha de emisión, método SAT (PUE/PPD), moneda, tipo de cambio, subtotal, impuestos trasladados (IVA), retenciones, total.
- `due_date` = emisión + 30 días si PPD; = emisión si PUE.
- Se renombra el botón en UI de "Importar XML" hacia el nuevo flujo dentro de `/cuentas-por-pagar`.

### 2. Reemplazo de `/expenses`
- La ruta `/expenses` redirige a `/cuentas-por-pagar` (manteniendo el deep link funcional desde dashboard/reportes).
- Se elimina la entrada del sidebar "Gastos Operativos".
- `OperatingExpensesPage` se borra junto con sus hooks/diálogos.
- Reportes (P&L) consultan `supplier_bills` con `status != 'cancelled'` agrupando por categoría — mantiene la fórmula actual de utilidad y se conserva la regla de excluir software/depreciación.
- Dashboard KPI "Gastos del mes" pasa a leer `supplier_bills.total` del mes en curso.

### 3. Subida de comprobante de pago
- Bucket privado `supplier-payment-receipts` (RLS: admin/administrativo upload+read, auditor read).
- `RegisterSupplierPaymentDialog` añade dropzone (PDF/JPG/PNG, max 5 MB) que sube antes de invocar la RPC y guarda la URL firmada en `supplier_payments.receipt_url`.
- En el drill-down, los pagos muestran link "Ver comprobante" cuando existe.

### 4. Reporte de Antigüedad de Saldos (Aging)
- Nueva página `/cuentas-por-pagar/antiguedad` (link desde header CxP).
- Tabla pivote por proveedor con columnas: Corriente, 1–30, 31–60, 61–90, +90, Total.
- Calculada en cliente desde `supplier_bills` con `balance > 0`, basada en `due_date` vs `nowMty()`.
- Exportable a CSV (`exportCsv`).
- KPI extra: total vencido y % vs cartera total.

### 5. Bitácora de actividad
- Eventos en `activity_feed`: `supplier_bill.created`, `supplier_bill.cancelled`, `supplier_payment.registered` (con monto y folio).
- Traducciones en `activityTranslations.ts`.

### 6. Audit Trail
- Añadir `supplier_bills` y `supplier_payments` a las 11 tablas con diff row-level existentes (subir a 13).

### 7. Tests
- `useAccountsPayableKpis` — recalcula correctamente con bills cancelled excluidas.
- Aging — buckets correctos para fechas frontera (0, 30, 31, 60, 61, 90, 91 días).
- `parse-cfdi-expense` — duplicado por UUID devuelve existente; PPD asigna due_date +30.

### 8. Changelog
- `public/changelog.json` + `public/changelog/v6.28.0.json` (minor, "Consolidación de Gastos en Cuentas por Pagar").

## Fuera de alcance (queda para PR 4)
- Aprobaciones por monto / rol antes de pago.
- Facturas recurrentes (renta, servicios fijos).
- Flujo de caja proyectado (cash-flow forecast) por semana.
- Conciliación bancaria.
- Complemento de pago CFDI 2.0 (PPD) automático.

## Notas técnicas

```text
supabase/
  migrations/<ts>_cxp_consolidation.sql    # bucket + audit triggers + drop operating_expenses (al final)
  functions/parse-cfdi-expense/index.ts    # reescritura: target = supplier_bills

src/features/accounts-payable/
  pages/AgingReportPage.tsx
  components/AgingMatrix.tsx
  hooks/useAgingReport.ts
  components/RegisterSupplierPaymentDialog.tsx   # + dropzone comprobante

src/features/expenses/                     # ELIMINADO
src/features/reports/hooks/...             # apuntan a supplier_bills
src/lib/routes-config.tsx                  # /expenses → redirect
src/layouts/sidebar/navConfig.ts           # quitar entrada Gastos
```

- La migración drop de `operating_expenses` se hace al final, una vez verificado que `legacy_expense_id` cubre todos los registros históricos (verificación en migración con `RAISE EXCEPTION` si hay huérfanos).
- El bucket usa políticas RLS scoped por rol vía `has_role`.
- El parser conserva compatibilidad: si llega un XML sin UUID o malformado, devuelve 400 con detalle.

¿Procedemos con PR 3 o prefieres reordenar (por ejemplo, primero recurrentes/aprobaciones)?
