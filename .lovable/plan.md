## Contexto

Hoy en LiftGo conviven **tres numeraciones** en una factura, y no las estamos exponiendo con claridad:

| Numeración | Origen | Cuándo se asigna | Campo BD |
|---|---|---|---|
| **Folio interno** `FAC-0082` | Nuestra secuencia Postgres | Al crear borrador | `invoice_number` |
| **Folio Facturapi** (serie + número) | Facturapi | Al timbrar | `facturapi_series` / `facturapi_folio_number` |
| **UUID fiscal SAT** | SAT vía Facturapi | Al timbrar | `cfdi_uuid` |

**Los tres son independientes.** El folio interno NO se reasigna al timbrar; el borrador `FAC-0082` sigue siendo `FAC-0082` aunque Facturapi le asigne otro número interno y otro UUID. El orden en que timbres los borradores tampoco altera la numeración interna.

El usuario percibe incertidumbre porque la UI no distingue visualmente estos tres conceptos ni ofrece una vista de conciliación mensual.

---

## Alcance del plan

Tres entregables:

1. **Educar en la UI del detalle de factura** — dejar claro qué folio es cuál.
2. **Reporte de conciliación mensual** — cruzar folios internos vs Facturapi vs SAT.
3. **Tooltips explicativos** — que el usuario aprenda sin salir del flujo.

---

## 1. UI del detalle de factura

En `InvoiceDetail.tsx` / `InvoiceDetailBadges.tsx`, crear una nueva sección compacta **"Identificadores"** que muestre siempre:

```text
Folio interno       FAC-0082          [tooltip: "Control administrativo LiftGo. Nunca cambia."]
Folio fiscal SAT    A1B2C3D4-...      [tooltip: "UUID asignado por el SAT al timbrar."]  (solo si timbrada)
Folio Facturapi     Serie A · 145     [tooltip: "Numeración interna del PAC."]           (solo si timbrada)
```

- Los tres con ícono `Copy` para copiar al portapapeles.
- Placeholder "— pendiente de timbrado —" para los dos fiscales cuando la factura está en borrador.
- Layout tipo `InfoRow` con `label` a la izquierda y valor monoespaciado a la derecha.

**Archivos a tocar:**
- `src/features/invoices/components/invoice-detail/InvoiceDetailIdentifiers.tsx` (nuevo)
- `src/features/invoices/pages/InvoiceDetail.tsx` (montarlo antes de acciones)
- Reutilizar `InfoRow` existente

---

## 2. Reporte de conciliación

Nueva página en `/invoices/reconciliation` (link en sidebar sección Facturación, solo admin/administrativo).

**Vista tabla:**

| Folio interno | Fecha | Cliente | Estado fiscal | Serie Facturapi | Folio Facturapi | UUID SAT | Ambiente | Total |
|---|---|---|---|---|---|---|---|---|

**Filtros:**
- Rango de fechas (default: mes en curso)
- Estado fiscal (Timbrada / Cancelada / Borrador / Todas)
- Ambiente (Sandbox / Producción / Todos)

**Acciones:**
- Exportar a XLSX (para conciliar contra el portal Facturapi y contra contabilidad)
- Click en fila → abre detalle de factura

**KPIs arriba:**
- Total facturado (timbradas en vivo)
- # facturas timbradas
- # canceladas
- # borradores pendientes
- Gaps de folio interno (ej. si falta `FAC-0079` en el rango)

**Archivos:**
- `src/features/invoices/pages/InvoicesReconciliation.tsx` (nuevo)
- `src/features/invoices/hooks/reconciliation/useReconciliationData.ts` (nuevo)
- `src/features/invoices/lib/reconciliationExport.ts` (nuevo)
- `src/routes/routes.ts` (registrar ruta)
- `src/layouts/sidebar/navConfig.ts` (item bajo Facturación)

---

## 3. Tooltips y microcopy

- En el modal de "Generar Recurrentes" y en el resultado, agregar nota:
  > "Los folios `FAC-XXXX` son de LiftGo. El folio fiscal SAT se genera al timbrar y puede ser distinto."
- En `RecurringInvoicesResultDialog.tsx` y `RecurringInvoicesPreviewDialog.tsx`.

---

## Consideraciones técnicas

- **BD:** ya tenemos `facturapi_series`, `facturapi_folio_number`, `cfdi_uuid`, `facturapi_env`. No requiere migración.
- **Detección de gaps:** query SQL que compare la serie de folios internos contra la secuencia esperada en el rango.
- **Export XLSX:** reutilizar patrón existente (skill xlsx / `xlsxwriter` en cliente vía dynamic import).
- **RLS:** la vista de conciliación filtra por `has_role('admin')` o `has_role('administrativo')`.
- **Changelog:** v6.106.0 (minor — nueva vista + mejora UI).

---

## Fuera de alcance

- Renombrar folios ya timbrados.
- Sincronización bidireccional con Facturapi (solo lectura de lo que ya tenemos en BD).
- Cambiar la lógica de asignación de folios internos (ya es idempotente vía `peek_next_invoice_number`).
