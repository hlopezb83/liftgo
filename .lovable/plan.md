# Incluir Seguro en cotizaciones

Agregar una opción "Incluir Seguro" en el formulario de cotización, con el mismo comportamiento que hoy tiene "Incluir Servicio de Logística": una casilla, un monto, y una partida propia en la cotización.

## Comportamiento

- En la tarjeta donde hoy vive "Incluir Servicio de Logística" se agrega una segunda casilla: **Incluir Seguro**.
- Al activarla aparece el campo **Monto del Seguro** (mismo formato de captura que el logístico).
- Si está activa y el monto es 0, el formulario marca error: "Ingresa el costo del seguro".
- Al desactivarla, el monto se limpia a 0.
- La partida se agrega al desglose como **"Seguro"** (cantidad 1, precio = monto), suma al subtotal y por lo tanto al IVA y total.
- Funciona igual para cotizaciones de renta y de venta.
- Al editar o duplicar una cotización existente, la partida "Seguro" se reconoce y vuelve a llenar la casilla y el monto (no se duplica como partida suelta).
- Al facturar desde la reserva, la partida de seguro viaja a la factura igual que hoy viaja la de logística.

## Detalle técnico

- `quoteFormSchema.ts`: campos `includeInsurance` (bool) y `insuranceCost` (no negativo), con la validación en `superRefine` espejo de la logística.
- `useQuoteForm.ts`: valores por defecto `false` / `0`.
- `useQuoteFormLogic.ts`: `useWatch` de ambos campos; empujar la partida `"Seguro"` en el `useMemo` de line items (después de la de logística); limpiarlos en el reset que hoy limpia logística.
- `LogisticsCard.tsx`: agregar el bloque de seguro en la misma tarjeta (se renombra internamente a un componente de "Servicios adicionales" manteniendo el archivo y su import en `QuoteForm.tsx`).
- `useQuotePrefill.ts`: generalizar `extractLogistics` a un extractor por descripción y excluir también "Seguro" del arreglo `nonLogistics` que reconstruye partidas de renta/venta.
- `nonRentalLines.ts`: la partida "Seguro" ya pasa el filtro (no es renta ni venta), pero se le asignan claves SAT de flete. Se ajusta para usar clave de servicio de seguros (84131500) cuando la descripción es de seguro, conservando 78101800 para el resto.
- Pruebas: casos nuevos en `quoteFormSchema.test.ts`, `useQuoteFormLogic.test.tsx`, `useQuotePrefill.test.tsx` y `nonRentalLines.test.ts`.
- Changelog: entrada minor (nueva capacidad del formulario).
