
# Validación de diffs de arquitectura pendientes (v7.205.0 → v7.206.0)

Ya aplicado en versiones previas: **Lote A** (DIFFs 1-5, v7.204.0) y **Lote B parcial** (DIFF 8 handlers CFDI, DIFF 9a invalidaciones muertas, DIFF 10c/d ya cerrados en v7.198.2/v7.203.0 — verificado en `CollectionForecast.tsx`, en v7.205.0).

## Auditoría uno a uno

| Diff | Estado real (verificado) | Acción |
|---|---|---|
| **9b** `useUpdateForklift` / `useDeleteForklift` | Bug real: usan `useMutation` crudo. `useDeleteForklift.onError` sólo hace rollback y **no** dispara toast → error silencioso al usuario. | **Migrar** a `useEntityMutation` (patrón R9). |
| **11.3** Triggers de auditoría faltantes | Real: `supplier_bills`, `bank_accounts`, `bank_statement_lines` no aparecen en ningún `CREATE TRIGGER ... audit`. | **Adjuntar** trigger de auditoría (patrón `20260215213953`). |
| **13** `select("*")` en PDF | Real (bajo impacto): 4 sitios — `src/lib/pdf/contract/fetchers.ts` (3) y `src/lib/pdf/shared.ts` (1). `quote/build.tsx` es en detalle único y acotado. | **Reducir** a columnas explícitas en `shared.ts` (company_settings) y `contract/fetchers.ts` (company_settings, customers, forklifts). |
| **10a** `InvoiceDetailActions` recomputa balance | **Falso positivo**: el archivo no contiene ningún cálculo `total - paid_amount`; delega en `computeInvoiceFlags`. | No aplica. |
| **10b** `rentalDays + 1` en 5 archivos | **Falso positivo**: `rg` en `src/features/bookings/` no encuentra ocurrencias. | No aplica. |
| **10c** `RentalFinancialSummary.tsx` | **Falso positivo**: el archivo no existe. | No aplica. |
| **18.6** `set_prospect_created_by` sin `search_path` | **Falso positivo**: ya fue corregido en `20260408004410`. | No aplica. |
| **6 / 7** Ciclos y `lib → features` | Real pero requiere mover barrels, tipos y renderers de PDF (>40 archivos). | **Documentar** en `.lovable/plan.md` como Lote C (fase propia). |
| **11.1 / 11.2** `delete_booking` RPC y soft-delete financiero | Decisión de negocio (hard vs. soft delete, efectos sobre facturación) — no es sólo refactor. | **Diferir** hasta acuerdo con negocio. |
| **9c / 9d** keys ad-hoc y unificación `company_settings` | Real, magnitud media (5 keys, 5 lectores). | **Diferir** a Lote C. |
| **12** consolidación de migraciones históricas | Riesgoso reescribir historia; sólo aporta la regla para futuras. | **Documentar** regla en CLAUDE, sin tocar histórico. |
| **14-18** Guardrails ESLint error, tests, RHF+zod, realtime, cosmética | Mejoras, no bugs. | **Diferir**. |

## Alcance de este entregable (v7.206.0)

Sólo lo confirmado como bug real y de alcance atómico:

1. **Migrar `useUpdateForklift` y `useDeleteForklift`** a `useEntityMutation` para no silenciar errores. Mantener el rollback optimista actual usando el hook (soporta `onMutate`/`onError` internos).
2. **Adjuntar triggers de auditoría** (`audit_row_trigger`) a `supplier_bills`, `bank_accounts`, `bank_statement_lines`. Migración idempotente con `DROP TRIGGER IF EXISTS`.
3. **Reducir `select("*")`** en `src/lib/pdf/shared.ts` (company_settings) y `src/lib/pdf/contract/fetchers.ts` (3 fetchers). Tipar con `.returns<T>()` donde ya haya `Tables<>`.
4. **Documentar** en `.lovable/plan.md` los DIFFs 6/7, 9c/d, 11.1/2 como Lote C con criterios de arranque.
5. Bump a **v7.206.0** y entradas de changelog.

## Detalles técnicos

- Verificar tras (2): consultar `audit_logs` tras un `UPDATE` sobre cada tabla para confirmar que el trigger emite el diff row-level.
- (3) debe mantener los campos que consumen los renderers (`getInvoicePdfData`, `contract` renderer). Auditar el consumidor antes de recortar columnas para no romper el PDF.
- No tocar `quote/build.tsx` — su `select("*")` alimenta un tipado dinámico posterior; recortarlo aquí es alto riesgo y bajo beneficio.
- (1) preserva la firma pública de los hooks; sólo cambia la implementación interna. Todos los `mutate(...)` existentes siguen funcionando.

## Fuera de alcance

- Ruptura de ciclos (DIFF 6/7): próxima fase.
- Soft-delete financiero y `delete_booking` RPC: requieren decisión de negocio.
- ESLint `error` mode y coverage gate: fase de guardrails.
