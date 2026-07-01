# Vista Previa de Facturas Recurrentes

Convertir el botón "Generar Recurrente" de un-click a un flujo **Preview → Select → Confirm → Results**, siguiendo el patrón estándar de SAP/NetSuite/Odoo (dry-run + confirm).

## Flujo UX

```text
[Botón "Generar Recurrentes"]
        ↓
Modal "Vista previa – Julio 2026"
  Header:  12 elegibles · 11 seleccionadas · $443,000 MXN
  Tabla agrupada por cliente:
     ☑ Cliente A  RSV-0012  Jul 2026  $15,000
     ☑ Cliente A  RSV-0018  Jul 2026  $22,000
     ⊘ Cliente B  RSV-0021  Ya facturada FAC-073  (deshabilitada)
     ☑ Cliente C  RSV-0033  Jul 2026  $18,500
  [Cancelar]   [Generar 11 facturas · $443,000]
        ↓
Toast "Generando..."  →  Modal de resultados
     ✓ 10 creadas (con links FAC-074 … FAC-083)
     ✗ 1 fallida (motivo + retry individual)
```

## Cambios técnicos

### 1. Edge Function `generate-recurring-invoices`

Añadir parámetro `{ preview: boolean, bookingIds?: string[] }`:

- **`preview: true`** → calcula el plan (mismas queries y reglas de idempotencia que el flujo actual) y devuelve `PreviewLine[]` sin escribir nada. Single source of truth: la misma función de cálculo se usa para preview y ejecución.
- **`preview: false, bookingIds`** → genera solo las reservas indicadas (respetando idempotencia server-side por si se duplicó el click).
- Respuesta preview:
  ```ts
  {
    period: "2026-07",
    lines: [{
      bookingId, bookingCode, customerId, customerName,
      periodStart, periodEnd, amount, currency,
      eligible: boolean,
      reason?: "already_invoiced" | "not_recurring" | "ended",
      existingInvoiceId?: string, existingInvoiceNumber?: string
    }]
  }
  ```
- Respuesta execute:
  ```ts
  { created: [{bookingId, invoiceId, invoiceNumber}], failed: [{bookingId, error}] }
  ```

### 2. Frontend nuevo

- `src/features/invoices/hooks/invoices/recurring/usePreviewRecurringInvoices.ts` — `useMutation` que llama con `preview: true`.
- Refactor `useGenerateRecurringInvoices.ts` — acepta `bookingIds` opcional.
- `src/features/invoices/components/recurring/RecurringInvoicesPreviewDialog.tsx`
  - Header con periodo (mes en español vía `formatMonthEs`) y KPIs (elegibles / seleccionadas / total MXN).
  - Tabla agrupada por cliente con checkbox por línea; filas no elegibles se muestran deshabilitadas con badge "Ya facturada FAC-XXX" enlazado.
  - Master-checkbox por grupo de cliente.
  - Footer: botón primario dinámico `Generar N facturas · $Total`.
  - Empty state cuando `eligible.length === 0`.
- `src/features/invoices/components/recurring/RecurringInvoicesResultDialog.tsx`
  - Sección "Creadas" con links a `/invoices/:id`.
  - Sección "Fallidas" con motivo y botón "Reintentar" (llama execute solo con ese `bookingId`).
  - Toast paralelo con conteo (`Ambos` según respuesta del usuario).

### 3. Integración

Reemplazar el handler actual del botón "Generar Recurrente" en `MaintenancePageActions.tsx` **y** en `InvoicesPage` (donde exista) para abrir el preview dialog en lugar de disparar la mutación directamente. Mantener `RoleGuard module="Facturación" minAccess="full"`.

### 4. Tests

- `generate-recurring-invoices/index_test.ts`: agregar casos `preview: true` (no escribe), `preview: false + bookingIds subset` (solo genera esas), respuesta con `eligible/reason`.
- Vitest para el dialog: render con líneas mixtas, toggle checkboxes, cálculo de total, botón deshabilitado cuando 0 seleccionadas.

### 5. Changelog

`v6.103.0` (minor) — nueva funcionalidad de preview.

## Fuera de alcance

- Guardar preferencias de exclusión persistentes (ej. "pausar cliente X 3 meses"): se puede evaluar en v2.
- Scheduling automático (cron para generar sin intervención): fuera de alcance; requiere decisión de negocio.

## Referencias

Memoria relevante: `mem://logic/recurring-billing-cycle`, `mem://logic/recurring-billing-pricing`, `mem://design/form-dialogs`.
