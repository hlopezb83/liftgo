

## Cambiar logica de calculo de renta: meses calendario en lugar de bloques de 30 dias

### Problema
Actualmente `calculateRentalCost` cuenta meses como bloques de 30 dias. Para los clientes mexicanos, del 1 de enero al 1 de febrero es 1 mes, y del 1 de febrero al 1 de marzo tambien es 1 mes, sin importar cuantos dias tenga cada mes. La logica actual cobra de mas o de menos dependiendo del mes.

### Solucion
Cambiar la funcion `calculateRentalCost` para que reciba las fechas reales (inicio y fin) en lugar de solo un conteo de dias, y usar `differenceInCalendarMonths` / `addMonths` de date-fns para calcular meses calendario reales.

### Logica nueva

```text
Entrada: startDate, endDate, dailyRate, weeklyRate, monthlyRate

1. Calcular meses calendario completos entre startDate y endDate
   - Usar differenceInCalendarMonths(endDate, startDate)
   - Verificar que addMonths(startDate, months) no exceda endDate
   - Si excede, reducir months en 1
2. Avanzar la fecha de referencia: remainderStart = addMonths(startDate, months)
3. Calcular dias restantes: differenceInDays(endDate, remainderStart) + 1
4. De los dias restantes, extraer semanas (bloques de 7) y dias sueltos
5. Generar line items igual que antes pero con las cantidades correctas
```

Ejemplo: 1 enero -> 1 marzo = 2 meses calendario (no 60/30 = 2 ni 59/30 = 1)
Ejemplo: 1 febrero -> 15 marzo = 1 mes + 14 dias (o 2 semanas, segun tarifas)

### Cambios tecnicos

**1. `src/lib/invoiceUtils.ts`**
- Cambiar firma de `calculateRentalCost`:
  - De: `(dailyRate, weeklyRate, monthlyRate, days)`
  - A: `(dailyRate, weeklyRate, monthlyRate, startDate: Date, endDate: Date)`
- Usar `differenceInCalendarMonths` y `addMonths` de date-fns para meses reales
- Mantener logica de semanas (7 dias) y dias para el residuo
- Actualizar `generateLineItems` para pasar Date objects en vez de dias

**2. `src/components/RentalFinancialSummary.tsx`**
- Actualizar llamada a `calculateRentalCost` para pasar fechas en vez de dias
- Ajustar el texto de "X dias" para reflejar la nueva logica

**3. `src/components/BookingActions.tsx`**
- Ya usa `generateLineItems(forklift, start, end)` — no necesita cambios directos (el cambio es interno a invoiceUtils)

**4. `src/components/PostInspectionInvoiceDialog.tsx`**
- Ya usa `generateLineItems(forklift, start, end)` — sin cambios

**5. `src/pages/QuoteForm.tsx`**
- Ya usa `generateLineItems` — sin cambios

**6. `src/pages/InvoiceForm.tsx`**
- Ya usa `generateLineItems` — sin cambios

**7. `src/test/invoiceUtils.test.ts`**
- Actualizar tests para usar fechas reales en vez de conteo de dias
- Agregar casos de prueba con meses de diferente longitud (febrero, meses de 31 dias)
- Ejemplo: `calculateRentalCost(50, 300, 1000, new Date("2025-01-01"), new Date("2025-03-01"))` deberia dar 2 meses

### Resumen de impacto
- Solo `calculateRentalCost` cambia de firma (de `days: number` a `startDate: Date, endDate: Date`)
- `generateLineItems` ya recibe fechas, solo se adapta internamente
- `RentalFinancialSummary` es el unico otro archivo que llama `calculateRentalCost` directamente y necesita ajuste
- Los demas consumidores usan `generateLineItems` y no se ven afectados

