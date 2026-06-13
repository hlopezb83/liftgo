## Lote 5 — Refactor focalizado + escaneo de seguridad

Sin god components reales en el código (los archivos 200-250 LOC son cohesivos: páginas con `useQuery` + tabla, o diálogos con un solo formulario). Hago un refactor quirúrgico de alto valor y aprovecho para correr el escáner de seguridad del backend.

### 1. Refactorizar `RecordPaymentDialog.tsx` (213 LOC → 3 archivos)

`src/features/invoices/components/invoices/RecordPaymentDialog.tsx` ya separa parcialmente `useRecordPaymentForm` (hook in-file de 70 LOC) del render (107 LOC). El hook viola la regla "hooks ≤80 LOC" si crece un campo más, y la lógica de validación (`amt <= 0`, `currency !== "MXN" && exch <= 0`) no tiene tests.

Cambios:

- Extraer `useRecordPaymentForm` a `src/features/invoices/hooks/invoices/useRecordPaymentForm.ts` (~70 LOC).
- Mantener `RecordPaymentDialog.tsx` como contenedor pequeño (~120 LOC, sólo render + uso del hook).
- Crear `src/features/invoices/hooks/invoices/__tests__/useRecordPaymentForm.test.ts` con 5 casos:
  - Estado inicial = `balance.toFixed(2)`.
  - Reset al abrir con nuevo balance.
  - `method` sincroniza `paymentFormSat` (mapa METHODS).
  - Submit con monto 0 → no llama `createPayment`, llama `notifyError`.
  - Submit con currency USD y exchangeRate 0 → no llama `createPayment`, llama `notifyError`.

Mock de `useCreatePayment` y `useStampPaymentComplement` con `vi.fn()`. Mock de `notifyError` de `appFeedback`.

### 2. Mover constante `METHODS` a domain

`METHODS` actualmente vive como const local en el dialog. La movería a `src/features/invoices/lib/paymentMethods.ts` con tipado `as const` para que sea reutilizable y testeable. El test #3 arriba la valida.

### 3. Correr `security--run_security_scan`

Aprovechando que ya estamos en auditoría, dispar el escáner de Supabase. Reporto findings al usuario; no aplico cambios automáticos. Si hay nuevas reglas faltantes o policies muy permisivas, las anoto como Lote 6 futuro.

### Fuera de alcance

- Refactor de `CRMClosedPage` (210 LOC) y `SupplierBillDetailSheet` (204 LOC): cohesivos, sin dividing line clara — refactor crearía abstracciones especulativas (anti-patrón).
- `ListPageLayout` (251 LOC): ya está dividido en 3 componentes locales (PullToRefreshIndicator, FiltersSlot, TableContent). Cumple Power of 10.

### Verificación

- `bunx tsc --noEmit -p tsconfig.app.json` limpio.
- `bunx vitest run` 574 + 5 = 579 tests verdes.
- `bunx knip` sin nuevos hallazgos.
- Scan de seguridad: reporte al usuario.

### Entregables

- `src/features/invoices/hooks/invoices/useRecordPaymentForm.ts` (nuevo).
- `src/features/invoices/hooks/invoices/__tests__/useRecordPaymentForm.test.ts` (nuevo, 5 tests).
- `src/features/invoices/lib/paymentMethods.ts` (nuevo).
- `src/features/invoices/components/invoices/RecordPaymentDialog.tsx` refactorizado (~120 LOC).
- Reporte de seguridad en el chat.
- `public/changelog.json` + `public/changelog/v6.64.0.json` (patch).

¿Procedo?