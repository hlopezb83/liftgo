
# Auditoría: Proveedores · Gastos · CxP · Pagos

## 1. Qué ya tenemos (estado actual)

**Proveedores** (`src/features/suppliers/`)
- CRUD básico + import desde CSF (RFC, régimen fiscal, dirección).
- Detail page, `SupplierSelector`, vínculo RFC→proveedor desde el diálogo de gasto (v6.25.3).
- Tabla `suppliers` con 13 columnas (RFC, régimen, categoría, contacto).

**Gastos operativos** (`src/features/expenses/`)
- CRUD + filtros (categoría/mes/búsqueda por descripción y proveedor) (v6.25.5).
- Parser de XML CFDI de gasto (edge function `parse-cfdi-expense`) con conciliación de proveedor.
- Categorías: renta, nómina, software, depreciación, costo de venta, caja chica, publicidad, otro.
- Tabla `operating_expenses` con `cfdi_uuid`, `supplier_id`.

**Pagos (cobranza de facturas emitidas)** (`src/features/invoices/hooks/usePayments.ts`)
- Pagos parciales sobre facturas emitidas a clientes, sincronización de estatus, complemento de pago CFDI (REP).
- Notas de cobranza, recordatorios.

## 2. Brechas críticas (lo que falta)

### A. Cuentas por Pagar (CxP) — **no existe**
Hoy `operating_expenses` asume que el gasto ya se pagó (solo tiene `expense_date` y `amount`). No hay:
- Concepto de **factura del proveedor** (folio, fecha de emisión vs fecha de vencimiento).
- **Saldo pendiente** por pagar / abonos parciales.
- **Antigüedad de saldos** (aging 0-30, 31-60, 61-90, 90+).
- Programación de pagos / calendario de vencimientos.
- Estado: borrador / por pagar / parcial / pagada / vencida / cancelada.

### B. Pagos a proveedores — **no existe**
- No hay tabla `supplier_payments`. El campo `payments` es solo para facturas a clientes.
- Falta método de pago, cuenta bancaria origen, referencia, comprobante (PDF/foto).
- Falta soporte multimoneda con tipo de cambio.

### C. CFDI de gastos — incompleto
- `parse-cfdi-expense` ya existe pero no almacena: subtotal, IVA, retenciones (ISR, IVA ret), folio fiscal completo, forma de pago SAT, método de pago (PUE/PPD), uso CFDI.
- No hay validación de duplicados por `cfdi_uuid` (debería ser único).
- No hay verificación de estatus SAT (vigente/cancelado).
- Falta repositorio de XML/PDF originales (storage bucket).
- Complementos de pago **emitidos por proveedores PPD** no se procesan.

### D. Proveedores — datos financieros faltantes
- Sin **cuenta bancaria** (CLABE, banco, beneficiario) para transferencias.
- Sin **términos de crédito** (días de pago, límite de crédito).
- Sin **moneda preferida**.
- Sin estado activo/inactivo, sin bloqueo por documentos vencidos.
- Sin **documentos del proveedor** (constancia fiscal, contrato, opinión de cumplimiento 32-D).

### E. Gastos recurrentes — no existe
- Renta, software, nómina son recurrentes pero hay que capturarlos manualmente cada mes.
- Falta plantilla de gasto recurrente + generación automática (similar a `generate-recurring-invoices`).

### F. Aprobaciones y control interno
- Sin flujo de **autorización de pago** por monto/rol.
- Sin **conciliación bancaria** (matching de movimientos vs pagos registrados).
- Sin **caja chica** con arqueo y reposición (hoy es solo una categoría).
- Sin órdenes de compra previas a la factura.

### G. Reportes y analítica
- No hay reporte de **antigüedad de CxP**.
- No hay **flujo de caja proyectado** (CxC + CxP por fecha).
- Gasto por proveedor / categoría / centro de costo no está expuesto.
- Falta tablero de "próximos a vencer / vencidos".

### H. Integraciones
- Sin descarga masiva del SAT (metadata.xml mensual).
- Sin exportación contable (póliza CONTPAQi/Aspel).

## 3. Roadmap recomendado (por fases)

### Fase 1 — Fundamentos CxP (mayor impacto)
1. Nueva tabla `supplier_bills` (factura recibida del proveedor): proveedor, folio, UUID CFDI único, fechas emisión/vencimiento, subtotal/IVA/retenciones/total, moneda, TC, método/forma pago SAT, status, saldo, XML/PDF URL.
2. Nueva tabla `supplier_payments`: bill_id, monto, fecha, método, cuenta origen, referencia, comprobante.
3. Migrar/extender `operating_expenses` para enlazar opcionalmente con `supplier_bill_id` (gastos sin factura siguen funcionando: caja chica, depreciación).
4. RPC `register_supplier_payment` (transaccional: inserta pago, recalcula saldo, actualiza status).
5. Módulo UI **Cuentas por Pagar**: lista con filtros (status, proveedor, vencimiento), drill-down panel, registrar pago.
6. Enriquecer `parse-cfdi-expense` para crear `supplier_bill` con todos los datos fiscales.

### Fase 2 — Proveedores robustos
7. Campos bancarios (banco, CLABE, cuenta, beneficiario, SWIFT), términos de crédito (días, límite), moneda default, status activo, documentos adjuntos.
8. Vista 360° del proveedor: bills, pagos, gastos, saldo total, antigüedad.

### Fase 3 — Recurrencia y aprobaciones
9. Gastos/bills recurrentes (plantilla + edge function de generación tipo `generate-recurring-bills`).
10. Flujo de aprobación por monto/rol (admin aprueba > X).
11. Caja chica como módulo (fondo, gastos, arqueo, reposición).

### Fase 4 — Reportes y conciliación
12. Reporte de antigüedad CxP, top proveedores, gasto por categoría/mes.
13. Flujo de caja proyectado (CxC vs CxP por semana).
14. Conciliación bancaria (importar estado de cuenta CSV, matching).
15. Exportación de pólizas contables.

### Fase 5 — SAT avanzado
16. Validación de estatus CFDI vigente/cancelado contra SAT.
17. Procesamiento de complementos de pago recibidos (PPD).
18. Bucket de storage para XML/PDF originales con retención fiscal (5 años).

## 4. Detalles técnicos clave

- Toda mutación multi-tabla vía RPC con `SECURITY DEFINER` y `SET search_path = public` (regla del proyecto).
- `cfdi_uuid` debe ser índice único parcial en `supplier_bills` para prevenir duplicados.
- Status enum: `draft | pending | partial | paid | overdue | cancelled` con trigger que recalcula `overdue` por fecha.
- RLS por rol: Admin/Administrativo CRUD total; Ventas/Despachador solo lectura; Auditor solo lectura.
- Reusar patrones: `MobileCardList`, drill-down panels, `usePagination`, `useListFilters`, `StatusBadge`, `formatCurrency`.
- Numeración de bills internos con prefijo `CXP-` vía RPC (regla de numeración del proyecto).
- Toda fecha en `America/Monterrey` con `nowMty()`, formato DD/MM/YYYY.
- Changelog: cada fase como minor (6.26.0 Fase 1, 6.27.0 Fase 2, etc.).

## 5. Pregunta para priorizar

¿Por dónde quieres arrancar? Mi recomendación es **Fase 1 (CxP + pagos a proveedores + CFDI enriquecido)** porque es el cimiento del resto y desbloquea reportes financieros reales. Podemos partirla en 2-3 PRs si prefieres entregar en incrementos.
