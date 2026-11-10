# Migración a Facturapi 6.0.0 — Fase 0: inventario

Plan aprobado: `.lovable/plan/migrar-el-erp-a-facturapi-6-0-0-2026-11-10.md`. Inventario de sólo lectura; sin cambios operativos.

## Versión

- npm `facturapi` `dist-tags.latest` = **6.0.0** (publicada 2026-11-02). El CHANGELOG del paquete la rotula "Unreleased".
- Operativo: `supabase/functions/deno.json` → `npm:facturapi@5.2.0`.
- Candidato: `qa/facturapi6-sandbox-candidate` → `npm:facturapi@6.0.0` (lock congelado).
- App/Preview: alias `facturapi6-preview` → `npm:facturapi@6.0.0` (aislado; no afecta operativo).
- Ningún archivo importa `facturapi/dist/...` (prohibido en v6).

## Archivos operativos que usan el SDK (21)

Todos pasan por `_shared/facturapi/client.ts`; ninguno importa `facturapi` directamente fuera de esa capa.

| Área | Archivos | Riesgo v6 |
|---|---|---|
| Capa SDK | `_shared/facturapi/client.ts`, `withTimeout.ts` | Alto: fechas `Date`, estados, errores, binarios |
| Timbrado | `stamp-cfdi/handler.ts`, `stamp-cfdi/invoiceGateway.ts`, `stamp-payment-complement/handler.ts`, `stamp-credit-note/handler.ts` | Alto: tipos de payload estrictos, estado `stamped` |
| Cancelación | `cancel-cfdi`, `cancel-credit-note`, `cancel-payment-complement`, `refresh-cancellation-status` | Medio: fechas de cancelación |
| Descarga | `download-cfdi/handler.ts` | Bajo: binarios |
| Recuperación | `process-cfdi-retry-queue/index.ts`, `reconcile-stamping-invoices/{index,invoiceProcessor,paymentProcessor,creditNoteProcessor,processorTypes}.ts` | Alto: `list` sin conteos (v5), fechas, estados |
| Validación fiscal | `validate-customers-tax-info`, `validate-receptor-tax-info` | Bajo |
| Pruebas | `reconcile-stamping-invoices/orgIsolation_test.ts`, `recoverCreditNotePdf_sdk_test.ts` | Ajustar dobles |

## Métodos SDK usados (fuera de tests)

`invoices.downloadPdf` (7), `invoices.downloadXml` (6), `invoices.retrieve` (3), `invoices.create` (2), `invoices.list` (1), `invoices.cancel` (1), además de llamadas encapsuladas en `client.ts` (REP/NC/estado de cancelación).

## Siguiente fase

Fase 1 (capa única SDK 6, apagada) parte del `client.ts` del candidato (~140 líneas de diferencia con el operativo). Requiere decisiones del usuario antes de Fase 3/4: crons durante sandbox, fixtures en ELOGISTIX e interruptor por empresa.
