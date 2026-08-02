# R12 — Correcciones de auditoría r11 (+ Fase 1 visual)

Verifiqué en código y base de datos los 10 hallazgos del documento: todos son reales. Abajo, qué se corrige y cómo.

## Bloque A — P1 (bloquean el GO)

### A1. Editar cotización legacy infla los totales
`rentalRateField()` hoy sólo mira la descripción; sin pista textual asume tarifa diaria y el importe mensual se multiplica por los días del periodo (totales fantasma de COT-0001 y COT-0005).

Se agrega la heurística por consistencia de importes: si la partida tiene un solo cargo (precio unitario igual al total) y el periodo es de 28 días o más, el importe se trata como mensual. Se pasa el contexto de días desde el prefill.

### A2. Re-elegir modelo pisa el precio pactado
En las líneas de renta, cambiar el modelo sobrescribe las tres tarifas con las del catálogo. Se cambia a rellenar sólo las tarifas que estén en cero, conservando precios históricos/negociados. Una línea nueva se comporta igual que hoy.

## Bloque B — P2

- **Selector de rango de fechas:** se activa `resetOnSelect` (existe en la versión instalada de react-day-picker); con un rango completo, el siguiente clic reinicia la selección. Se conserva la lógica manual como respaldo.
- **Detalle de cotización legacy:** la columna CANT. sale vacía porque esas partidas usan `qty`; se lee `quantity ?? qty ?? 1`.
- **Fecha de OT (base de datos):** `maintenance_logs.performed_at` usa `CURRENT_DATE` (UTC) → pasa a `today_mty()`. El barrido encontró el mismo caso en `supplier_bills.issue_date`, `credit_notes.issued_at`, `operating_expenses.expense_date`, `supplier_payments.payment_date`, `invoices.issued_at` y `payments.payment_date`: son fechas de negocio, se migran todas en la misma migración.
- **Cierre de OT:** el resumen usa sólo `manual_cost`; se cambia a `manual_cost || cost` para OTs antiguas.
- **Export SPEI:** se excluye `status = 'draft'` del listado de dispersión.
- **Antigüedad de CxP:** hoy sólo excluye canceladas; se excluyen también borradores.
- **Vigencia de cotización:** el valor por defecto pasa a `max(hoy+30, fecha fin del periodo)` y se añade validación de que la vigencia no sea anterior al inicio del periodo.
- **`role_permissions`:** la política de lectura es `USING(true)`; se reemplaza por una restringida a roles internos vía `has_role`.

## Bloque C — Fase 1 visual (paquete UI/UX)

Sólo tokens y componentes compartidos, sin rediseño:
- Paleta cálida low-saturation en `:root` y `.dark`, con el dorado de marca como `--primary`/`--ring`. Se conservan destructive/success/warning/info.
- Escala del Gantt derivada de la marca (se eliminan morado y rosa saturados).
- Badge de estado unificado (punto de color + etiqueta, fondo /10, borde /20) adoptado en cotizaciones, reservas, facturas, flota, OTs y usuarios.
- Encabezado de página unificado y eliminación del título duplicado en Cliente 360.

## No se toca (documentado en la auditoría)
Estatus "invertidos" de CxP en la réplica, `/activity` mostrando "Sistema", fotos de daño en réplica local y filtros de fecha históricos: son artefactos del entorno de pruebas, no bugs.

## Detalles técnicos
- Archivos: `useQuotePrefill.ts`, `RentalLineItems.tsx`, `DateRangePickerField.tsx`, `ReadOnlyLineItemsTable.tsx`, `CloseWorkOrderDialog.tsx`, `useExportablePayables.ts`, `useAgingReport.ts`, `useQuoteForm.ts` + `quoteFormSchema.ts`, `src/index.css`, badge de estado y header de página.
- Migraciones: una para los `DEFAULT today_mty()` y otra para la política de `role_permissions`.
- Pruebas unitarias nuevas para `rentalRateField` (mensual por consistencia, diaria intacta), `handleModelChange` (no pisa tarifas), aging/export sin borradores y validación de vigencia.
- Último paso: entrada nueva en `public/changelog.json` + `public/changelog/v7.275.0.json` y sincronización de `package.json` / `public/version.json`.
