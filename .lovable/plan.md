# Fix: Las facturas ignoran las tarifas pactadas en la reserva

## Diagnóstico (verificado)

En `src/features/invoices/hooks/invoiceForm/useInvoiceFormHandlers.ts`, la función `buildLinesForBooking` genera las partidas de renta con:

```ts
const items = generateLineItems(forklift, booking.start_date, booking.end_date);
```

`generateLineItems` (en `src/lib/domain/rentalCalculation.ts:158`) lee `forklift.daily_rate`, `weekly_rate` y `monthly_rate` — es decir, las tarifas **actuales** del montacargas, no las tarifas **pactadas** que trae la reserva.

La tabla `bookings` sí almacena sus propias tarifas (`daily_rate`, `weekly_rate`, `monthly_rate` — `types.ts:390/397/408`) y `BookingWithForklift` las expone (`src/types/rental.ts:41-43`). El flujo de **extensión de reserva** ya respeta esto correctamente en `useExtendBookingPreview.ts:31-33`:

```ts
daily_rate: booking.daily_rate ?? forklift.daily_rate,
weekly_rate: booking.weekly_rate ?? forklift.weekly_rate,
monthly_rate: booking.monthly_rate ?? forklift.monthly_rate,
```

Pero el flujo de **creación de factura desde reserva** no. Inconsistencia confirmada: si un montacargas cambió de tarifa después de creada la reserva (o la reserva se pactó con tarifa distinta), la factura se genera con la tarifa equivocada.

Es el único call-site de producción afectado (buscado en todo `src/`).

## Cambio

**Archivo:** `src/features/invoices/hooks/invoiceForm/useInvoiceFormHandlers.ts`

1. Ampliar el tipo local `Booking` para incluir `daily_rate`, `weekly_rate`, `monthly_rate` (campos que ya vienen en `BookingWithForklift`, que es lo que realmente pasa `useInvoiceFormLogic.ts:143`).
2. En `buildLinesForBooking`, fusionar las tarifas: `booking.daily_rate ?? forklift.daily_rate ?? 0` (y lo mismo para weekly/monthly), y pasar ese objeto fusionado a `generateLineItems` — idéntico al patrón de `useExtendBookingPreview.ts`.

```ts
function buildLinesForBooking(booking: Booking, forklifts: Forklift[] | undefined): LineItemValues[] {
  const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
  if (!forklift) return [];
  const rated: Forklift = {
    ...forklift,
    daily_rate: booking.daily_rate ?? forklift.daily_rate ?? 0,
    weekly_rate: booking.weekly_rate ?? forklift.weekly_rate ?? 0,
    monthly_rate: booking.monthly_rate ?? forklift.monthly_rate ?? 0,
  };
  const items = generateLineItems(rated, booking.start_date, booking.end_date);
  // ...map igual que antes
}
```

## Por qué `?? forklift ?? 0` y no solo `booking`

- `booking.daily_rate ?? forklift.daily_rate`: si la reserva no capturó tarifa (null), cae a la del montacargas. Igual que en extensiones.
- `?? 0`: `generateLineItems`/`calculateRentalCost` esperan `number`, no `null`. Garantiza tipo correcto sin romper cuando ambos son null (tarifa cero → partidas en cero, ya detectable, mejor que un NaN silencioso).

## Pruebas

- Añadir caso en `src/lib/domain/__tests__/rentalCalculation.test.ts` o un test del handler que verifique que una reserva con `daily_rate` propio produce partidas con esa tarifa (no la del forklift).
- Verificar: typecheck (`tsgo`), lint, y suite existente (1698 tests).

## Versión

Patch (v7.320.2) — corrección de bug de cálculo en facturación, sin cambio de contrato ni de esquema.

## Analogía (para contexto)

Es como que el mecánico te cotizó el aceite a $500 en la orden de servicio, pero al cobrar en caja la cajera ignora la orden y cobra el precio que hoy tiene el aceite en el estante ($600). La orden (reserva) ya trae el precio pactado; hay que leerlo de ahí.
