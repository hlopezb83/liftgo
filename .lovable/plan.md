## Objetivo

Cuando una cotización se convierte a reserva, las tarifas (diaria / semanal / mensual) que se cotizaron por línea deben **propagarse al campo de tarifas del montacargas físico asignado**, sobreescribiendo las tarifas que tenía registradas. Así, la facturación recurrente y los contratos generados a partir de esa reserva usarán automáticamente el precio acordado con el cliente.

## Flujo actual (referencia)

```text
Cotización (rental)
  └─ line_items[]  +  rental_meta:[{modelId, quantity}]
        ↓ usuario hace "Convertir a Reserva"
        ↓ EquipmentAssignmentDialog → elige forklift por slot
        ↓ createBookingsFor(forkliftIds, recurring)
              ├─ INSERT bookings (uno por forklift)
              └─ INSERT quote_assigned_forklifts (line_index ↔ forklift_id)
```

Hoy `rental_meta` sólo guarda `{modelId, quantity}` — se pierde la tarifa pactada.

## Cambios propuestos

### 1. Extender `rental_meta` para incluir tarifas

`src/lib/lineItems.ts` → ampliar `RentalLineMeta`:

```ts
export interface RentalLineMeta {
  modelId: string;
  quantity: number;
  dailyRate?: number;
  weeklyRate?: number;
  monthlyRate?: number;
}
```

Al guardar la cotización (formulario de creación/edición de cotización), persistir las tarifas de cada `RentalLine` dentro de `rental_meta` (además de las que ya viajan en `line_items`). Esto evita tener que reconstruirlas desde el texto de la línea.

Compatibilidad: cotizaciones existentes seguirán funcionando porque los campos son opcionales; si faltan, se usará el fallback del paso 3.

### 2. Pasar las tarifas al diálogo de asignación

`EquipmentAssignmentDialog`:
- El tipo `rentalMeta` se actualiza para incluir las tarifas opcionales.
- Cada `AssignmentSlot` recordará `dailyRate / weeklyRate / monthlyRate` heredadas de su línea.
- Mostrar (sólo lectura) bajo cada slot la tarifa mensual cotizada como confirmación visual: "Tarifa pactada: $X / mes".

`onConfirm` cambia su firma a:
```ts
onConfirm(assignments: { forkliftId: string; dailyRate: number; weeklyRate: number; monthlyRate: number }[])
```

### 3. Aplicar tarifas al forklift en la conversión

`src/hooks/quoteDetail/useQuoteConversionActions.ts`, dentro de `createBookingsFor`:

Antes de crear cada `booking`, ejecutar un `UPDATE` sobre el forklift asignado:

```ts
await supabase.from("forklifts").update({
  daily_rate: slot.dailyRate,
  weekly_rate: slot.weeklyRate,
  monthly_rate: slot.monthlyRate,
}).eq("id", slot.forkliftId);
```

Fallback para cotizaciones legacy donde `rental_meta` no trae tarifas: leer las tarifas desde el `LineItem` correspondiente (matcheo por `modelId` o por descripción) y usarlas; si tampoco hay, dejar las tarifas actuales del forklift (no sobreescribir con 0).

### 4. Flujo legacy (`convertToBookingLegacy`)

Mismo principio: cuando se matchea un forklift a partir de la descripción del line item, tomar `unit_price` del item como `monthly_rate` (la duración ≥ 30 días suele implicar mensual) o respetar la lógica ya usada en `calculateRentalCost`. Para no sobre-diseñar, en este flujo legacy nos limitamos a actualizar `monthly_rate` cuando esté claramente derivable; si no, no modificamos.

### 5. Feedback al usuario

- Toast adicional: "Tarifas actualizadas en N equipo(s) según la cotización".
- Registrar entrada en `activity_feed` con título "Tarifas de equipo actualizadas" describiendo equipo, tarifa anterior y nueva (útil para auditoría — ya tenemos `audit_logs` automáticos sobre `forklifts` que capturarán el diff fila a fila).

### 6. Implicaciones en flujos posteriores (ya cubiertas, sólo confirmar)

- **Facturación recurrente**: ya lee `monthly_rate` del forklift en el momento de generar (memoria `recurring-billing-pricing`). ✓
- **Contratos**: el formulario de contrato pre-llena tarifas desde `forklifts.daily/weekly/monthly_rate` (`useContractFormPrefill`). ✓
- **Estatus del forklift**: ya se mueve a `sold` en ventas y queda en `confirmed/booked` por la reserva. No tocamos esa lógica (memoria `forklift-status-persistence`).

### 7. Tests

Agregar caso a `src/test/bookingFlow.test.ts` (o nuevo `quoteToBookingRates.test.ts`):
- Dada una cotización con `rental_meta` que incluye `monthlyRate=12000`, al convertir a reserva sobre un forklift cuya tarifa actual es `8000`, verificar que se hizo el `update` con `12000`.
- Caso legacy sin `rental_meta` con tarifas: el forklift no se sobreescribe a 0.

### 8. Changelog

Nueva entrada **v5.59.0** (minor — feature visible al usuario):
- `public/changelog.json` (índice)
- `public/changelog/v5.59.0.json` con título "Tarifa cotizada se aplica al equipo al crear la reserva".

## Archivos a modificar

- `src/lib/lineItems.ts` — ampliar `RentalLineMeta`.
- `src/components/quotes/RentalLineItems.tsx` — ya maneja tarifas; no requiere UI nueva.
- Hook que arma el payload de la cotización al guardar (revisar `src/hooks/quoteForm/*` y guardar tarifas dentro de `rental_meta`).
- `src/components/quotes/EquipmentAssignmentDialog.tsx` — heredar y mostrar tarifas, cambiar firma de `onConfirm`.
- `src/components/quotes/QuoteConversionDialogs.tsx` — pasar payload extendido.
- `src/hooks/quoteDetail/useQuoteConversionActions.ts` — aplicar `UPDATE forklifts` + fallback legacy + toast.
- `src/test/...` — test de regresión.
- `public/changelog.json` + `public/changelog/v5.59.0.json`.

## Confirmación

¿Procedo con esta implementación, incluyendo el guardado de tarifas dentro de `rental_meta` (camino limpio) y el fallback para cotizaciones existentes?
