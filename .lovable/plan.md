# Refactor Lotes 5–10 — Cierre de la auditoría arquitectónica

Continuación de la auditoría (Lotes 1–4 ya entregados en v6.38.0–v6.38.3). Cada lote es un commit independiente con su propia entrada de changelog y validación `bun run lint` + `bunx vitest run`.

## Lote 5 — `ManualMatchPicker` con React Query (v6.38.4 · patch)

**Problema:** El componente hace `fetch` manual a Supabase, gestiona `loading`/`error` con `useState`/`useEffect` y no cachea entre aperturas.

**Acciones:**
- Crear `src/features/bank-reconciliation/hooks/useManualMatchCandidates.ts` (`useQuery`, queryKey `["manual-match-candidates", txId]`, `enabled` cuando el dialog está abierto).
- Reemplazar el `useEffect` + `supabase.from(...)` dentro del componente por el hook.
- Mantener la UI idéntica; usar `isPending`/`error` del query.

## Lote 6 — Romper `useInvoiceDetailActions` (160 LOC) (v6.38.5 · patch)

**Problema:** Hook concentra timbrado, descarga XML, edición, eliminación y backfill snapshot fiscal en un solo archivo.

**Acciones:**
- Extraer `backfillStampSnapshot` a `src/features/invoices/lib/backfillStampSnapshot.ts` (función pura, sin React).
- Crear `useStampInvoiceFlow.ts` (precheck + backfill + `stampCfdi.mutate`).
- Crear `useDownloadInvoiceXml.ts` (consume `fetchCfdiBlob` de Lote 3, con fallback `cfdi_xml`).
- `useInvoiceDetailActions.ts` queda como orquestador ≤80 LOC que compone los hooks anteriores + delete/update.

## Lote 7 — Romper `usePortalExtras` (225 LOC) (v6.38.6 · patch)

**Problema:** Un solo hook expone payment intents, public quotes, public contracts, reviews, etc.

**Acciones:** dividir por dominio en `src/features/portal/hooks/`:
- `usePaymentIntents.ts` (admin + cliente + review mutation).
- `usePortalQuotes.ts` y `usePortalContracts.ts`.
- `usePortalExtras.ts` se mantiene como barrel re-export para no romper imports existentes.
- Cada hook ≤80 LOC.

## Lote 8 — Centralizar constantes de dominio (v6.39.0 · minor)

**Problema:** `"MXN"` y `STATUS_LABELS`/`MOTIVE_LABELS` inline duplicados en 8+ archivos.

**Acciones:**
- `src/lib/domain/currency.ts`: `DEFAULT_CURRENCY = "MXN"`, `SUPPORTED_CURRENCIES`.
- `src/lib/domain/creditNoteMotives.ts`: `MOTIVES`, `MOTIVE_LABELS` (extraído de `InvoiceCreditNotesCard`, `CreateCreditNoteDialog`).
- `src/lib/domain/paymentIntentStatus.ts`: status + label + variant (extraído de `PaymentIntentsSection`).
- Reemplazar literales en consumidores (sin cambios de comportamiento).
- Resolver el residual de Lote 1: mover `IncomeStatement` types a `src/lib/domain/`.

## Lote 9 — RPC atómico para credit notes (v6.39.1 · patch)

**Problema:** `useCreateCreditNote` ejecuta varios `INSERT`/`UPDATE` desde el cliente — riesgo de inconsistencia si falla a mitad.

**Acciones:**
- Migración SQL: `public.create_credit_note(p_invoice_id, p_motive, p_lines jsonb, ...)` `SECURITY DEFINER`, `SET search_path = public`, transaccional, devuelve la nota creada.
- Reescribir `useCreateCreditNote` para llamar al RPC (una sola request).
- Mantener invalidaciones de query existentes.

## Lote 10 — Limpieza estructural final (v6.39.2 · patch)

**Acciones menores ordenadas por riesgo:**
1. Mover `src/features/quotes/utils/` (puros, sin deps de React) a `src/lib/quotes/`.
2. Crear `src/features/operations/{hooks,lib}/` y reubicar utilidades operativas dispersas.
3. Lazy-load del portal (`React.lazy` sobre las rutas `/portal/*`).
4. Sub-extraer componentes >300 LOC detectados por la auditoría (`InvoicePaymentSummary`, `InvoiceCreditNotesCard`, `SupplierFormDialog`) en subcomponentes de presentación.

## Validación por lote

Cada lote termina con:
- `bun run lint` → 0 errores.
- `bunx vitest run` → 493/493 pasando (más si se añaden tests).
- Entrada en `public/changelog.json` + `public/changelog/v{X.Y.Z}.json`.

## Detalles técnicos

- Sin cambios de UI visible salvo en Lote 7 si se detectan regresiones del portal.
- Sin `any`/`!`/`as`, hooks ≤80 LOC, componentes ≤150 LOC (Power of 10).
- Lote 9 requiere aprobación de migración SQL antes de continuar con el código consumidor.
- Imports legacy se preservan vía re-exports en Lotes 7 y 8 para evitar diffs masivos.

## Orden de ejecución

5 → 6 → 7 → 8 → 9 (espera aprobación de migración) → 10. Cada uno se entrega secuencial; el cierre de Lote 10 marca el fin de la auditoría.
