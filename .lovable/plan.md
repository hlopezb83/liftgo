# Sprint v7.90.0 — Fixes A, B, C, D (auditoría de lógica de negocio)

Aplicar los cuatro arreglos verificados en el orden sugerido (C y A primero, luego B, luego D). Cada uno incluye tests.

## Fix C — NC bloqueada en facturas pagadas (mayor impacto)
**Archivo:** `src/features/invoices/components/invoice-detail/InvoiceCreditNotesCard.tsx`
- Cambiar `maxCreditable = total − totalPaid − activeCredits − draftCredits` por `maxCreditable = total − activeCredits − draftCredits`.
- Quitar `totalPaid` del cálculo si queda sin uso en el card (verificar antes).
- Extraer helper puro `computeMaxCreditable(invoiceTotal, activeCredits, draftCredits)` a `src/features/invoices/lib/`.
- **Decisión de negocio aplicada:** versión simple; "saldo a favor / devoluciones" queda como feature pendiente documentada en changelog.
- **Test:** vitest — factura pagada 100% → max = total − acreditado; con NC borrador → resta ambas; sin créditos → max = total.

## Fix A — Cobro de daños usa costo real cuando existe
**Archivo:** `src/features/damage/components/damage/DamageActions.tsx`
- `handleCreateInvoice`: si `record.status === "repaired"` usar `actual_cost ?? estimated_cost`; si no, `estimated_cost`.
- Deshabilitar botón "Cobrar" cuando `!(actual_cost ?? estimated_cost)`.
- Extraer regla a helper puro `chargeableDamageCost(record)` en `src/features/damage/lib/`.
- Verificar que `useDamageRecords` incluye `actual_cost` en el select (o usa `select("*")`).
- **Test:** vitest — repaired+actual → real; repaired sin actual → estimado; reported → estimado; sin ambos → null (botón disabled).

## Fix B — Motivo de cancelación REP explícito (server + UI)

### B1 · Servidor
**Archivo:** `supabase/functions/cancel-payment-complement/handler.ts`
- Reemplazar el fallback silencioso `?? "02"` por `jsonError(req, 400, "motive must be one of 01,02,03,04")` cuando no venga válido.
- **Test Deno:** sin motive → 400; motive inválido → 400; "03" → prosigue (mockeando Facturapi + auth).

### B2 · UI
**Archivo:** `src/features/invoices/hooks/invoices/usePaymentHistoryColumns.tsx`
- Sustituir el `confirm` que manda `motive: "02"` fijo por un `CancelRepDialog` con `SelectField` Zod (patrón `CancelCfdiDialog`).
- Opciones: 02, 03, 04 (omitir 01, no hay flujo de REP sustituto).
- Ubicación nueva: `src/features/invoices/components/invoice-detail/CancelRepDialog.tsx`.

## Fix D — Guarda `end_date` en facturación recurrente (cierra BL-13)
**Archivo:** `supabase/functions/generate-recurring-invoices/index.ts` (+ tipo compartido con `usePreviewRecurringInvoices.ts`)
- Añadir `end_date` al select de `buildPlan`.
- Antes de otros checks: si `end_date < billingStart` → line no elegible con reason `booking_ended`.
- Extender union `PreviewReason` en front (`usePreviewRecurringInvoices.ts`) con `"booking_ended"` y traducir el motivo en la UI del preview.
- **Test Deno:** `buildPlan` con reserva vencida → reason `booking_ended`, sin item en `items`.

## Verificación final
- `bun run lint --max-warnings 0`
- `bunx vitest run` (esperar 1040+ verdes)
- `cd supabase/functions && deno fmt --check && deno test --allow-net --allow-env`
- Playwright manual de: crear NC en factura pagada, cobrar daño reparado, cancelar REP con motivo 03.

## Changelog
- `public/changelog.json` (index) + `public/changelog/v7.90.0.json` (detail) — tipo `minor` (cambios de comportamiento en cobro y cancelación).
