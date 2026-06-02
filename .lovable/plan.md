## Ajuste lógico en tooltip de Flujo de Efectivo

### Problema
La fórmula del Neto en el tooltip del gráfico de Flujo de Efectivo está invertida: actualmente calcula `pagado - facturado`. Si se facturó más de lo que se pagó, el resultado aparece negativo, lo cual es contraintuitivo para un flujo de caja.

### Cambio
Invertir la fórmula en `CashFlowTooltip` para que el Neto sea `facturado - pagado`:
- **Facturado > Pagado** → Neto positivo (generaste facturación pendiente de cobro = flujo entrante futuro).
- **Pagado > Facturado** → Neto negativo (anticipo de pago o sobre-pago = flujo saliente).

### Archivos
- `src/features/dashboard/components/dashboard/CashFlowChart.tsx` — línea 23: `const net = item.paid - item.invoiced` → `const net = item.invoiced - item.paid`
- `public/changelog/v6.20.1.json` — entrada patch
- `public/changelog.json` — agregar referencia