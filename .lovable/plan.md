# Fase 3 (revisada): Export Excel de pagos masivos a proveedores

En lugar de generar layouts SPEI bancarios (`.txt`), generaremos un **archivo Excel (.xlsx)** con las facturas aprobadas pendientes de pago, que el usuario puede subir manualmente a su banca en línea o usar como respaldo operativo.

## Alcance

### 1. Nueva pantalla / sección en Cuentas por Pagar

En `/cuentas-por-pagar`, agregar un botón **"Exportar pagos a Excel"** que abra un diálogo:

- **Filtros**:
  - Rango de fechas de vencimiento (default: hoy + 7 días)
  - Estado: solo `aprobada` con saldo > 0 (default y único por ahora)
  - Selección de facturas (checkbox por fila, con "seleccionar todas")
- **Vista previa** en tabla compacta zebra:
  - Proveedor, RFC, Banco, CLABE, Cuenta, Folio factura, Vencimiento, Saldo, Monto a pagar (editable, default = saldo)
- **Totales**: cantidad de pagos + suma total MXN
- **Validaciones antes de exportar**:
  - Cada proveedor seleccionado debe tener al menos una `supplier_bank_accounts` activa con CLABE válida (18 dígitos)
  - Marcar en rojo las filas sin cuenta bancaria y bloquear export hasta resolverlas o desmarcarlas
- Botón **"Descargar Excel"**

### 2. Archivo Excel generado

Una sola hoja `Pagos` con columnas:

| Proveedor | RFC | Banco | CLABE | Cuenta | Referencia | Concepto | Folio Factura | Fecha Vencimiento | Monto MXN |

- Formato MXN con separador de miles, fecha DD/MM/YYYY
- Fila final con TOTAL
- Nombre archivo: `pagos-proveedores-DDMMYYYY-HHmm.xlsx`
- Usar librería ya disponible (revisar si hay `xlsx`/`exceljs` en el proyecto; si no, usar `xlsx` SheetJS — ya común en stack o se agrega)

### 3. Registro del lote (opcional pero recomendado)

Crear tabla `supplier_payment_batches` para auditar qué se exportó:

- `id`, `exported_by`, `exported_at`, `bill_ids` (uuid[]), `total_amount`, `notes`
- Tabla puente `supplier_payment_batch_items` o simplemente JSONB con snapshot
- RLS: Admin/Administrativo lectura y escritura
- Esto permite ver historial en una pestaña "Lotes exportados"

> Si prefieres no auditar todavía, podemos omitir esta tabla y solo generar el Excel.

### 4. Marcar facturas como "en proceso de pago" (opcional)

Agregar columna `payment_in_progress_at` (timestamptz nullable) en `supplier_bills`, que se setea al exportar y se limpia cuando se registra el pago real con `register_supplier_payment`. Sirve para evitar exportar dos veces la misma factura.

## Detalles técnicos

- Hook nuevo: `useExportablePayables(filters)` → lista facturas aprobadas con join a `supplier_bank_accounts` (cuenta primaria/activa).
- Componente nuevo: `src/features/accounts-payable/components/ExportPaymentsDialog.tsx`
- Utilidad: `src/features/accounts-payable/lib/buildPaymentsXlsx.ts` (genera blob con SheetJS y dispara descarga).
- Si añadimos tabla de lotes: migración + RPC `create_payment_batch(p_bill_ids uuid[], p_notes text)` que también marca `payment_in_progress_at`.
- Test unitario para `buildPaymentsXlsx` (estructura de filas, formato monto/fecha, total correcto).
- Changelog `v6.34.2` (minor): "Export Excel de pagos masivos a proveedores".

## Preguntas antes de implementar

1. ¿Incluimos el **registro de lotes** (`supplier_payment_batches`) y el flag `payment_in_progress_at`, o solo generamos el Excel sin rastro? La mejor practica
2. ¿La columna **"Referencia"** del Excel se autogenera (ej. `LIFTGO-FOLIO`) o queremos que el usuario la edite por fila? se autogenera
3. ¿Mantenemos solo formato **.xlsx**, o también ofrecemos **CSV** como alternativa rápida? solo xlsx