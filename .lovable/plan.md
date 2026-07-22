## Validación v7.167.0

Se corrieron 39 tests focalizados (fleet + CFDI) tras la Fase 5 y pasaron todos, y `tsgo --noEmit` está limpio. Sin embargo, **tres de los cinco bloques nuevos no tienen cobertura de test**:

- Bloque 10a (`forkliftFormSchema` superRefine) — no hay assertions para año/capacidad/altura/tarifas fuera de rango.
- Bloque 14 (`useRecordPaymentForm` prellenado TC) — el test file existente no cubre el nuevo prop `invoiceExchangeRate`.
- Bloque 20 (`cancel_booking` guard) — sin test que reproduzca la cancelación de una reserva ya cancelada/completada.

Los bloques 16 (contraste CSS) y 18a (filtro contratos) son visuales/derivados; validables sólo por revisión manual y typecheck.

## Fase 6 — Cerrar cobertura y avanzar bloques restantes

### 6.1 Retro-tests de la Fase 5 (blindaje)
1. Ampliar `src/features/fleet/lib/__tests__/forkliftFormSchema.test.ts` con casos:
   - Año 1979 y `CURRENT_YEAR + 2` → falla; año `2020` → pasa.
   - `capacity_kg` = "0", "-5", "150000" → falla; "5000" → pasa.
   - `mast_height_m` = "25" → falla; "6" → pasa.
   - `daily_rate` negativo → falla; `monthly_rate` > máximo → falla.
2. Ampliar `src/features/invoices/hooks/invoices/__tests__/useRecordPaymentForm.test.ts`:
   - Con `invoiceCurrency="USD"` + `invoiceExchangeRate=17.25` → `exchangeRate` inicial = `"17.25"`.
   - Con `invoiceCurrency="MXN"` → `exchangeRate` = `"1"` sin importar prop.
   - Con `invoiceExchangeRate=null` en USD → cae a `"1"`.

### 6.2 Bloque 11 — Badge visual del ciclo de timbrado
Archivo: `src/features/invoices/components/invoice-detail/InvoiceDetailBadges.tsx`.
- Añadir badges para `stamping` (amarillo animado, "Timbrando…") y `error` (rojo, "Falló timbrado — reintentar") cuando `stamp_state` cambia.
- Nuevo test que renderice cada estado y verifique el texto visible.

### 6.3 Bloque 13 — Moneda visible en Estado de Cuenta PDF
Archivo: `src/lib/pdf/documents/CustomerStatementDocument.tsx`.
- Anteponer código ISO (`MXN` / `USD`) a cada monto de factura y a los totales, agrupando por divisa cuando existan ambas.
- Verificar rendering vía snapshot o test unitario del builder de filas.

### 6.4 Bloque 17b — Portal: eliminar "flash 404" en refresh autenticado
Archivo: `src/layouts/AuthGuard.tsx`.
- Usar `useIsRestoring()` de TanStack Query para bloquear el fallback a `NoAccess` mientras la sesión persistida se restaura.
- Test con `QueryClient` en modo restoring que confirme que se mantiene el spinner en lugar de mostrar el `<NoAccess />`.

### 6.5 Bloque 20 — Test de la RPC cancel_booking
Archivo nuevo: `src/features/bookings/hooks/__tests__/cancelBooking.rpc.test.ts` con mocks de `supabase.rpc`:
- Éxito en reserva `confirmed`.
- Error propagado cuando la RPC devuelve `"No se puede cancelar una reserva en estado cancelled"`.
- Verifica que el hook consumidor traduce el error a `notifyError` con el mensaje del backend.

### 6.6 Bloques diferidos (fuera de esta iteración)
Bloques 15 (TZ inspecciones — ya cerrado en Fase 3), 18b (ciclo de vida contratos), 19a/c/d y el batch 21 de pulido visual se mantienen para Fase 7 tras validar Fase 6.

### 6.7 Cierre
- `bunx tsgo --noEmit` limpio.
- `bunx vitest run` de los directorios tocados en verde.
- Nueva entrada v7.168.0 en `public/changelog.json` + detalle en `public/changelog/v7.168.0.json`.

## Detalles técnicos

- Los tests de `useRecordPaymentForm` usan `renderHook` + wrappers ya existentes en `src/test/helpers/queryClient.tsx`; reutilizar patrón.
- Para `AuthGuard`, `useIsRestoring` requiere `PersistQueryClientProvider`; simular con mock del hook para evitar acoplar el test al persister real.
- El test de RPC de cancel_booking se hace a nivel hook (unit), no integración; la lógica SQL ya fue verificada por el linter de Supabase al aplicar la migración.
- `InvoiceDetailBadges` recibe el `stamp_state` desde `useInvoice`; no requiere cambios en hooks.
