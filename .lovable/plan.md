# Plan — Cierre Fase 1 Auditoría de Tests v3 (v7.223.0)

Contexto: DIFF 1-8, 10, 11, 13, 16 y partes de 9/12/15 ya cerrados en v7.220-v7.222. Este plan cierra los residuales de Fase 1. Fase 2 (P1-P5) queda diferida a PR dedicado.

## 1. DIFF 9 residual — REP Anexo 20 casos faltantes

`supabase/functions/stamp-payment-complement/decisions_test.ts` (ya existe con caso EquivalenciaDR):
- Agregar `computeInstallmentMeta({ previousPayments: [...], invoiceTotal, thisAmount })` puro en `decisions.ts`: calcula `NumParcialidad` (count(prev)+1) e `ImpSaldoAnt` (invoiceTotal − Σprev).
- Refactor `index.ts` para consumir el helper (hoy lo calcula inline).
- Tests: parcialidad 1 (saldo = total), 2 (con un pago previo), 3+ (idempotencia orden), pago > saldo → error de validación.

`supabase/functions/stamp-payment-complement/handler_test.ts` (nuevo, patrón DI de stamp-cfdi):
- Test "claim BL-04": 2ª petición concurrente encuentra `rep_status='in_progress'` (via `updatesSeq`) → 409 sin llamar al PAC.

## 2. DIFF 12 residual — hooks/features en 0

`src/features/users/__tests__/roleGuards.test.ts` (nuevo):
- Guard "último admin no puede auto-degradarse": mock `count(user_roles where role='admin')` = 1 + self-update → error.
- Guard admite auto-degradación cuando count > 1.

`src/features/returns/hooks/__tests__/useReturnInspection.test.tsx` (nuevo, `createSupabaseChainMock` + QueryClient):
- 2º submit sobre inspección `status='completed'` → early return sin RPC.
- `hour_meter_in < hour_meter_out` → schema Zod rechaza.
- Happy path: dispara invalidación de bookings + forklifts + damage_records.

`src/features/maintenance/hooks/__tests__/useRecurringMaintenance.test.tsx` (nuevo):
- Al cerrar OT con `is_recurring=true` se invoca RPC `generate_recurring_maintenance` con el forklift_id correcto.
- OT no recurrente NO llama al RPC.

## 3. DIFF 14 — data-testids + migración E2E

5 componentes reciben `data-testid`:
- `InvoiceDetailActions.tsx`: `invoice-register-payment`, `invoice-stamp-cfdi`.
- `RecordPaymentDialog.tsx`: `payment-submit` en el submit.
- `StatusTabs` (`src/components/StatusTabs.tsx` o equivalente): `status-tab-${value}` por tab.
- `QuoteDetail` botón PDF: `quote-download-pdf`.

4 specs migran los selectores frágiles a `getByTestId`:
- `tests/e2e/full-flow.spec.ts:29` (registrar pago)
- `tests/e2e/invoice-payment.spec.ts:19`
- `tests/e2e/quote-pdf.spec.ts:23`
- `tests/e2e/filters-invoices.spec.ts:17-20`

El resto del copy en español se conserva por texto (fuera de alcance).

## 4. DIFF 15 residual — centinela + API denegada

`tests/e2e/roles-matrix.spec.ts`:
- Test **CENTINELA**: verifica `E2E_ADMINISTRATIVO_EMAIL`, `E2E_VENTAS_EMAIL`, `E2E_MECANICO_EMAIL` presentes; si faltan, falla (no skip silencioso).
- Test **mutación denegada por API**: con el JWT del mecánico, `request.post` directo a `${VITE_SUPABASE_URL}/rest/v1/invoices` con body mínimo → 401/403 (blindaje RLS + UI oculta juntos).

## 5. Versionado + changelog

- `package.json` / `public/version.json` → `7.223.0` (minor).
- `public/changelog/v7.223.0.json` (detalle) + entrada en `public/changelog.json` (índice) al inicio del array.

## 6. Validación

- `deno test --no-check` para stamp-payment-complement (nuevos handler_test + decisions_test).
- `bunx vitest run` acotado a los nuevos archivos: roleGuards, useReturnInspection, useRecurringMaintenance.
- `bunx tsgo` en los componentes que reciben `data-testid`.
- No se ejecutan E2E ni CI aquí; los specs migrados quedan validados por el pipeline en el PR.

## Fuera de alcance (Fase 2, PR dedicado)

P1 supabase local en CI · P2 fast-check property-based · P3 factories tipadas · P4 ratchet coverage 14→40 · P5 stryker + vitest-axe. Requieren infra de CI adicional (secrets, tiempo de ejecución) y migración masiva de fixtures — no se abordan aquí.
