Revisé el documento R22 contra el código actual. La mayoría ya se aplicó en v7.249.0 y v7.250.0 (QueryErrorState en los 6 reportes, retry del calendario, zebra única, meta money en Daños/OTs, FormActions con Cancelar a la izquierda, KpiTile sin truncate con `kpiSizeClass`, eje Y compacto en costos de mantenimiento, errores de login en es-MX, sidebar colapsado, DetailRow, BrandMark en el portal, empty states con CTA, `sortUndefined`, print headers).

Quedan 4 bloques sin cablear. Propongo cerrarlos en este orden.

## 1. R22-A — Terminar el cableado de `isDirty` en modales
Ya lo tienen Cliente, Proveedor, Contacto y Cuenta bancaria de proveedor, Prospecto y Cuenta bancaria. Falta pasar `isDirty` (y protección contra pérdida de datos al cerrar con Esc / clic fuera) en:
- `RecordPaymentDialog`, `EditPaymentDialog`
- `ReportDamageDialog`
- `SupplierBillFormDialog`
- `MaintenanceFormDialog`
- `DeliveryFormDialog`
- `EditReceptorFiscalDialog`
- `FeedbackFormDialog`
- `InviteUserDialog`
- `ReportTransferDialog` (portal)
- `PartFormDialog` (ya calcula `isDirty` para el guard, sólo falta pasar la prop)

Para los que no usan React Hook Form, se deriva el flag comparando el estado actual contra los valores iniciales (mismo helper que ya se usó en Prospecto).

## 2. R22-N — Copy de botones y títulos a sentence case
Cambiar sólo texto visible en: toolbar de Clientes, Facturas, Cotizaciones, Contratos, Proveedores, Flota, Cuentas por pagar, atajos de creación rápida del menú, y títulos de diálogo (Nuevo cliente, Editar cliente, Nueva factura de proveedor, Reportar daño, Agregar montacargas, Editar cotización, etc.). No se tocan las etiquetas de etapas del CRM (son nombres de estado, no acciones).

## 3. R22-U — Tabla del portal con el componente del sistema
`PortalInvoicesTable.tsx` usa dos `<table>` crudas. Migrarlas a `Table/TableHeader/TableRow/TableCell` de `@/components/ui/table` para heredar zebra, densidad y el fade de scroll en móvil.

## 4. C-1 — Migración de columnas a `meta: { kind }`
Reemplazar el combo manual `align + font-mono` inline por `meta: { kind: "money" | "number" | "date" | "badge" }` en las tablas principales: Facturas (Total, Saldo), Cuentas por pagar (Total/Saldo), Cotizaciones (Total), Inventario (Costo, Existencias), Prospectos (Valor), Contratos, Devoluciones y las tablas de reportes. Es puramente de presentación: alineación y tipografía tabular consistentes.

## Fuera de alcance (queda re-agendado)
- **B-11 kanban optimista**: mover tarjetas cross-columna directo al soltar con rollback. Es cambio de lógica de mutación en CRM/Mantenimiento y merece su propia ronda con pruebas.

## Notas técnicas
- Sin migraciones ni cambios de base de datos; todo es frontend/presentación.
- Verificación: `bun run lint`, tests unitarios, y revisión visual en el preview de los modales tocados y del portal.
- Al final se agrega la entrada v7.251.0 en `public/changelog.json` y `public/changelog/v7.251.0.json`.
