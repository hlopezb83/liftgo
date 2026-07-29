# Matriz de cobertura de pruebas — Auditoría R2

**Generado:** 2026-07-29 · **Versión base:** v7.260.3
**Cobertura global medida:** 26.42% líneas | 22.04% funciones | 20.14% statements | 27.12% branches

## Leyenda

| Tipo | Significado |
|---|---|
| U | Test unitario / de componente (Vitest) |
| I | Test de integración contra base de datos real o mock de cadena Supabase |
| E | Test E2E (Playwright) |
| F | Test de Edge Function (Deno) |
| ✅ | Cubierto |
| ⚠️ | Parcial (smoke o no ejercita la regresión concreta) |
| ❌ | No encontrado |

## Parte 1 — Base de datos (DB2)

| ID | Prioridad | Tema | Tests encontrados | U | I | E | F | Estado |
|---|---|---|---|---|---|---|---|---|
| DB2-01 | P0 | `invite-user` usa `onConflict: "user_id"` y falla 500 | `supabase/functions/invite-user/index_test.ts` (smoke) | ❌ | ❌ | ❌ | ⚠️ | **CRÍTICO: el test actual no valida el fix** |
| DB2-02 | P0 | `validate_transition` cubre INSERT | `src/test/bookingStateMachine.test.ts` (helper frontend) | ⚠️ | ❌ | ❌ | ❌ | El trigger en sí no tiene test |
| DB2-03 | P0 | Metadatos fiscales solo por flujo SAT | Ninguno directo | ❌ | ❌ | ❌ | ❌ | **CRÍTICO** |
| DB2-04 | P1 | Lock de cotización aceptada | Ninguno directo | ❌ | ❌ | ❌ | ❌ | **ALTO** |
| DB2-05 | P1 | `completed→confirmed` eliminado + inspección obligatoria | `src/test/bookingStateMachine.test.ts`, `src/features/returns/lib/returnInspectionSchema.test.ts` | ⚠️ | ❌ | ❌ | ❌ | El trigger `bookings_completed_requires_inspection` no tiene test |
| DB2-06 | P1 | `forklifts.status` solo vía flujo controlado | Ninguno directo | ❌ | ❌ | ❌ | ❌ | **ALTO** |
| DB2-07 | P1 | Auditoría de flip `is_e2e` | `src/features/audit/__tests__/auditImmutability.test.ts` (relacionado) | ❌ | ❌ | ❌ | ❌ | **ALTO** |
| DB2-08 | P1 | Notas de crédito: aritmética y signo | `src/features/invoices/hooks/creditNotes/__tests__/` (por confirmar) | ❓ | ❓ | ❌ | ❌ | **ALTO** |
| DB2-09 | P1 | CxP: anti-sobrepago + aprobación | `src/features/accounts-payable/hooks/__tests__/useCreatePaymentBatch.test.ts` | ⚠️ | ❌ | ❌ | ❌ | **ALTO** |
| DB2-10 | P1 | Entregas: "no pasado" en UPDATE | Ninguno directo | ❌ | ❌ | ❌ | ❌ | **ALTO** |
| DB2-11 | P1 | Cotizaciones vencidas: re-vigencia obligatoria | Ninguno directo | ❌ | ❌ | ❌ | ❌ | **ALTO** |
| DB2-12 | P1 | Daños: soft delete restaura forklift + cargo obligatorio | `src/features/damage/hooks/__tests__/useDamageRecords.test.ts` | ⚠️ | ❌ | ❌ | ❌ | **ALTO** |
| DB2-13 | P2 | `supplier_bills.total` no menor a lo pagado | Ninguno directo | ❌ | ❌ | ❌ | ❌ | Medio |
| DB2-14 | P2 | `invoices.line_items` cuadran con subtotal | `src/lib/domain/__tests__/invoiceTotals.test.ts` | ✅ | ❌ | ❌ | ❌ | Cubierto a nivel helper |
| DB2-15 | P2 | Pagos sobre facturas `draft` rechazados | `src/features/invoices/hooks/__tests__/usePayments.rls.test.ts` | ⚠️ | ❌ | ❌ | ❌ | Medio |
| DB2-16 | P2 | `deliveries` CHECK de dominio de status | Ninguno directo | ❌ | ❌ | ❌ | ❌ | Medio |
| DB2-17 | P2 | Contratos: tasas/depósito no negativos | `src/features/contracts/lib/__tests__/contractFormSchema.test.ts` (por confirmar) | ❓ | ❌ | ❌ | ❌ | Medio |
| DB2-18 | P2 | Borrar cotizaciones aceptadas/convertidas | Ninguno directo | ❌ | ❌ | ❌ | ❌ | **ALTO** |
| DB2-19 | P2 | `complete_return_inspection` idempotente | `src/features/returns/lib/returnInspectionSchema.test.ts` | ⚠️ | ❌ | ❌ | ❌ | Medio |
| DB2-20 | P2 | `paid→sent/partial/overdue` solo desde sync de pagos | `src/lib/domain/__tests__/invoiceHelpers.more.test.ts`, `src/lib/domain/__tests__/invoiceTotals.test.ts` | ⚠️ | ❌ | ❌ | ❌ | Medio |
| DB2-21 | P2 | Lockout último admin + exención e2e estricta | `src/test/roleMatrix.test.ts`, `src/test/rolePermissions.test.ts` | ⚠️ | ❌ | ❌ | ❌ | Medio |

## Parte 2 — Frontend (FE2)

| ID | Prioridad | Tema | Tests encontrados | U | I | E | F | Estado |
|---|---|---|---|---|---|---|---|---|
| FE2-01 | P1 | Alert de truncamiento fuera del Sheet móvil | Ninguno directo | ❌ | ❌ | ❌ | ❌ | **ALTO** |
| FE2-02 | P1 | Alert de truncamiento en 5 páginas limitadas | Ninguno directo | ❌ | ❌ | ❌ | ❌ | **ALTO** |
| FE2-03 | P2 | Falso positivo `hasReachedListLimit` en 500 exactos | Ninguno directo | ❌ | ❌ | ❌ | ❌ | Medio |
| FE2-04 | P1 | Portal: `isError` en todas las páginas | Ninguno directo | ❌ | ❌ | ❌ | ❌ | **ALTO** |
| FE2-05 | P2 | Feedback/Help: falso-vacío ante error | Ninguno directo | ❌ | ❌ | ❌ | ❌ | Medio |
| FE2-06 | P2 | Audit trail: límite 200 + aviso | `src/features/audit/components/auditTrail/__tests__/` (por confirmar) | ❓ | ❌ | ❌ | ❌ | Medio |
| FE2-07 | P2 | ReturnInspectionDialog: notas y costo inline | `src/features/returns/lib/returnInspectionSchema.test.ts` | ⚠️ | ❌ | ❌ | ❌ | Medio |
| FE2-08 | P1 | CRM: quitar "Reabrir deal" | `src/features/crm/lib/__tests__/prospectFormSchema.test.ts` | ⚠️ | ❌ | ❌ | ❌ | **ALTO** |
| FE2-09 | P1 | Quitar transición `completed→confirmed` de reservas | `src/test/bookingStateMachine.test.ts` | ✅ | ❌ | ❌ | ❌ | Cubierto a nivel helper |
| FE2-10 | P2 | Copy diálogo nota de crédito según estado | Ninguno directo | ❌ | ❌ | ❌ | ❌ | Medio |
| FE2-11 | P2 | Entregas: registro histórico + limpiar refine | Ninguno directo | ❌ | ❌ | ❌ | ❌ | Medio |
| FE2-12 | P2 | Advertencia al completar reserva sin inspección | `src/features/returns/lib/returnInspectionSchema.test.ts` | ⚠️ | ❌ | ❌ | ❌ | Medio |
| FE2-13 | P3 | Changelog: estado de error con reintento | Ninguno directo | ❌ | ❌ | ❌ | ❌ | Bajo |

## Resumen de brechas críticas

- **P0 sin cobertura real:** DB2-01, DB2-02 (trigger), DB2-03.
- **P1 sin tests de integración ni E2E:** DB2-04 a DB2-12, DB2-18, FE2-01/02/04/08.
- **Cobertura global insuficiente:** 26% líneas no es robusta para un ERP fiscal; los umbrales de `vitest.config.ts` (14%) son demasiado permisivos.

## Recomendación inmediata

1. Cerrar primero los 3 P0 y los P1 de seguridad/estado (DB2-01, DB2-02, DB2-03, DB2-05, DB2-07, DB2-12, DB2-18).
2. Añadir tests de componente para FE2-04, FE2-08 y FE2-12.
3. Subir los umbrales de cobertura global a ≥30% y los directorios críticos a ≥70%.
4. Ejecutar el suite E2E completo y marcar qué specs cubren cada flujo R2.
