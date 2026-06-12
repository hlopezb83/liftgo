# Lote 2 — Parte 1: Reescritura de flow tests

## Problema actual

Los tres tests en `src/test/` (`bookingFlow.test.ts`, `invoiceFlow.test.ts`, `paymentFlow.test.ts`) son **falsos positivos**: definen mocks de Supabase y luego llaman a esos mocks directamente, validando solo que el mock funcione. No invocan ninguna línea de código de producción, así que una regresión real en los hooks no rompería los tests.

## Objetivo

Sustituirlos por tests que ejerciten los hooks reales (`useBookingMutations`, `useInvoices`/`useNextInvoiceNumber`, hook de pagos) usando `renderHook` de `@testing-library/react`, con `createSupabaseChainMock` como capa de mock. Esto sí detecta regresiones en payload de RPC, mapeo de columnas, manejo de errores, e invalidación de queries.

## Alcance

### 1. `src/test/bookingFlow.test.ts`
- Importar `useCreateBooking` desde `src/features/bookings/hooks/useBookingMutations.ts`.
- Mockear `@/integrations/supabase/client` con `createSupabaseChainMock` (rpc resolver configurable).
- Mockear `sonner` para verificar `toast.success`/`toast.error`.
- Casos:
  - Happy path: dispara `create_booking` con el payload `p_*` exacto, retorna id, llama `toast.success` y invalida `bookings`/`forklifts`.
  - Error RPC (forklift no disponible): propaga error, `toast.error` con el mensaje del backend.
  - Recurring billing flag se pasa correctamente.

### 2. `src/test/invoiceFlow.test.ts`
- Importar el hook real de creación de facturas (`useCreateInvoice` o equivalente en `useInvoices.ts`) y `useNextInvoiceNumber`.
- Casos:
  - Genera número vía `next_invoice_number` y luego inserta en `invoices` con el `invoice_number` resuelto.
  - Si el RPC de numeración falla, no se ejecuta el insert.
  - Calcula `subtotal/tax/total` y los persiste.

### 3. `src/test/paymentFlow.test.ts`
- Importar el hook real de creación de pago.
- Casos:
  - Pago completo → invoice pasa a `paid`.
  - Pago parcial → invoice pasa a `partial`.
  - Error de RLS en insert → `toast.error` y no se actualiza la factura.

### 4. Helper compartido
- Extender `src/test/helpers/mockSupabase.ts` si hace falta (ej. permitir distintos resolvers por tabla). Mantener API retrocompatible con los tests existentes (`useDocuments.rls.test.ts` ya lo usa).

### 5. QueryClient wrapper
- Añadir `src/test/helpers/queryClient.tsx` con un `createWrapper()` que monte un `QueryClientProvider` fresco por test (retries off, gcTime 0). Lo usarán los tres tests.

## Fuera de alcance (lo veremos en sub-lotes siguientes)
- Tests RLS faltantes
- Tests Deno fiscales (`stamp-credit-note`, `cancel-payment-complement`, `generate-recurring-invoices`, `parse-cfdi-expense`)
- Teardown en `customer-create.spec.ts` E2E
- `coverage.thresholds` en `vitest.config.ts`

## Cambios técnicos

```
src/test/helpers/queryClient.tsx        (nuevo)
src/test/helpers/mockSupabase.ts        (ampliar resolvers por tabla)
src/test/bookingFlow.test.ts            (reescritura completa)
src/test/invoiceFlow.test.ts            (reescritura completa)
src/test/paymentFlow.test.ts            (reescritura completa)
public/changelog.json                   (entrada v6.43.1)
public/changelog/v6.43.1.json           (nuevo, patch)
```

## Validación
- `bunx vitest run src/test/bookingFlow.test.ts src/test/invoiceFlow.test.ts src/test/paymentFlow.test.ts` debe pasar verde.
- La suite completa no debe regresionar.

## Pregunta abierta
¿Avanzo solo con esta Parte 1 (flow tests reescritos), o quieres que también empuje en la misma vuelta el teardown del E2E `customer-create` y los `coverage.thresholds`? Lo más limpio es esta Parte 1 sola para mantener el PR pequeño y verificable.
