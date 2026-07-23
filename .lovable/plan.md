
# v7.216.0 — Cierre de C6 (columnas explícitas)

Del backlog `liftgo-diffs-lovable-v212.md`, la verificación previa confirmó que **C4b, C4c, C7 y C11.4 ya están cerrados** en versiones anteriores (v7.207.0 / v7.209.0 / v7.213.0 / migración `20260408004410`). El único bloque mecánico con impacto real hoy es **C6**: 12 `select("*")` en hot-path que inflan payload y bloquean el guardrail arquitectural.

## Alcance

Reemplazar `select("*")` por columnas explícitas (`<ENTITY>_COLUMNS` colocado junto al hook o en `lib/queryKeys.ts` del feature) + `.returns<T>()` cuando el tipo lo permita. Sin cambios de comportamiento.

## Archivos a tocar

| Archivo | Tabla |
|---|---|
| `src/features/invoices/hooks/invoices/useInvoices.ts` (2 ocurrencias) | invoices |
| `src/features/invoices/hooks/usePayments.ts` | payments |
| `src/features/invoices/hooks/creditNotes/useCreditNotesQueries.ts` | credit_notes |
| `src/features/invoices/hooks/invoices/pdf/fetchInvoicePdfData.ts` | invoices (con embed) |
| `src/features/maintenance/hooks/maintenance/useMaintenanceLogs.ts` | maintenance_logs |
| `src/features/contracts/hooks/useContractTemplates.ts` | contract_templates |
| `src/features/help/hooks/useUserManual.ts` | user_manual |
| `src/lib/query/documentsQueryKeys.ts` | documents |
| `src/lib/pdf/quote/build.tsx` | quotes |
| `src/features/dashboard/lib/queryKeys.ts:205` | (a verificar tabla) |
| `src/features/audit/lib/queryKeys.ts:72` | audit_log |

## Fuera de alcance

- **C5** (RPC `delete_booking` y soft-delete financiero): requiere migración + rediseño UX; se pospone hasta tener caso de uso de recuperación real.
- **C4a** (3 llaves literales restantes): 2 son singletons únicos válidos; se puede cerrar en un lote cosmético posterior.
- **C8/C9/C10/C11.1–3,5–6**: tests adicionales, RHF+zod en `useProspectForm`, realtime opcional, deprecación de `formatDateDisplay`. Todos son mejoras, no bugs.

## Aceptación

- `rg 'select\("\*"\)' src/` → 0 (o allowlist documentada con comentario).
- `bash scripts/arch-check.sh` verde.
- `bun run test` sin regresiones (los hooks tocados tienen tests en `invoices`, `maintenance`, `contracts`).
- Snapshot manual del preview: listados de facturas, pagos, NC, mantenimiento, plantillas de contrato y manual de usuario cargan igual.
- Bump `v7.216.0` + entrada en `public/changelog.json` + `public/changelog/v7.216.0.json`.
