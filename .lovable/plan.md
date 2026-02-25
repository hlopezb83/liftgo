
# Fix: Bug critico en DateRangePickerField + Datos de prueba para verificar RecurringBillingBadge

## Problema 1: Date picker crashea al seleccionar fechas

El componente `DateRangePickerField.tsx` causa un error DOM: "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node" al seleccionar la segunda fecha del rango. Este es un bug conocido con la combinacion de `react-day-picker` y Radix `Popover` — el auto-cierre del popover interfiere con el DOM del calendario mientras este aun esta procesando el evento de clic.

### Solucion
En `src/components/DateRangePickerField.tsx`:
- Aumentar el delay del auto-cierre de 300ms a 400ms para dar tiempo al calendario de completar la actualizacion del DOM antes de cerrar el popover
- Envolver el `setOpen(false)` en un `requestAnimationFrame` para asegurar que se ejecute despues de que el DOM se haya estabilizado

## Problema 2: No hay reservas con facturacion recurrente para probar

Actualmente ninguna reserva tiene `recurring_billing = true`. Una vez arreglado el date picker, se podra crear una nueva reserva con la opcion de facturacion recurrente activada para verificar el badge.

Como solucion alternativa mas rapida, se puede actualizar una reserva existente via migracion para activar `recurring_billing` y `last_billed_date`, permitiendo verificar el badge inmediatamente sin depender de la UI.

### Pasos
1. Ejecutar una migracion SQL para activar `recurring_billing = true` y `last_billed_date = '2026-02-01'` en una de las reservas existentes de STK INDUSTRIAS
2. Arreglar el bug del date picker
3. Verificar el badge en la pagina de Calendario

## Cambios tecnicos

### Archivo: `src/components/DateRangePickerField.tsx`
- En el `useEffect` de auto-cierre, cambiar la logica de cierre para usar `requestAnimationFrame` antes del `setTimeout`
- Esto evita que el popover se cierre mientras el calendario aun esta manipulando el DOM

### Migracion SQL (datos de prueba)
```sql
UPDATE bookings
SET recurring_billing = true, last_billed_date = '2026-02-01'
WHERE id = '4d0306e7-1f0e-42af-9002-fea4229e86a3';
```

## Resultado esperado
- El date picker permite seleccionar rangos de fechas sin crashear
- La reserva de STK INDUSTRIAS muestra el badge "Recurrente" en el Calendario
- Al hacer hover sobre el badge, se ven las fechas: "Ult. factura: 1 feb 2026" y "Prox. factura: 3 mar 2026"
