# Ciclos de aniversario en el motor recurrente

## Problema
El motor recurrente automático solo arma periodos por mes calendario (del 1 al último día). En la Reserva 046, la factura previa cubre del 11/09 al 10/11. Por eso el siguiente mes calendario (noviembre) choca a medias con esa factura y el motor lo marca "en revisión" sin facturar.

## Regla nueva
- Si el historial de la reserva es **continuo y verificable** y su último día facturado **no es fin de mes**, el siguiente periodo empieza al día siguiente y dura un mes de aniversario (11/11 → 10/12), igual que la factura manual.
- Precio: la mensualidad pactada completa en cada ciclo de aniversario; solo se prorratea el último tramo si el contrato termina antes del fin del ciclo.
- Si el historial termina en fin de mes, todo sigue igual que hoy (meses calendario).
- Siguen bloqueando, como hoy: historial sin fechas, huecos o traslapes reales, falta de cliente, de tarifa o de tipo de cambio, y una reserva ya terminada.
- No cambian las facturas existentes, los impuestos, las claves SAT ni la cola de reintentos.

## Cambios
1. **Cálculo de periodos** (`periods.ts`): una función nueva calcula el siguiente ciclo de aniversario y lo recorta al fin de contrato. Usa las mismas reglas de fin de mes que `pendingRecurringPeriod.ts` (31 → 30 o 28/29).
2. **Planificador** (`planner.ts`): cuando el último tramo facturado continuo termina a media mes, avanza con ciclos de aniversario en lugar de meses calendario. También se aplica al ponerse al día con varios ciclos pendientes (máximo 24).
3. **Prorrateo** (`prorate.ts`): el ciclo de aniversario completo cobra la mensualidad completa; el tramo final se prorratea según los días del ciclo.
4. **Etiqueta** del periodo en la vista previa: "11/11/2026 – 10/12/2026".
5. **Pruebas Deno** puntuales:
   - RSV-0046: propone 11/11–10/12 por $27,000 y después 11/12–10/01.
   - Historial que termina el día 30 o 31: sigue en meses calendario.
   - Hueco o traslape: sigue bloqueado.
   - Fin de contrato a media del ciclo: se prorratea.
   - Ciclo que inicia el día 31.
6. Changelog (minor), roadmap y una regla en AGENTS.md.

## Despliegue
Requiere desplegar `generate-recurring-invoices`. Lo haré solo con tu autorización, con los crons en pausa como en despliegues anteriores. No se emite ningún CFDI durante las pruebas.

## Detalles técnicos
- El historial continuo ya se obtiene con `mergedInvoicePeriods`. Si el último intervalo termina antes del fin de su mes, el planificador marca la reserva como `anniversary` y usa `nextAnniversaryPeriod(lastEnd, endDate)`.
- `periodCoverageFromIntervals` no cambia: con ciclos alineados, el resultado vuelve a ser "uncovered" o "covered" en lugar de "overlap".
- Se mantienen `previewFingerprint` y la idempotencia; el periodo forma parte de la huella, así que un reintento no duplica la factura.
- Validación en Lovable: solo pruebas Deno de generate-recurring-invoices, sin red. La suite completa corre en CI.

## Ideas opcionales
- Permitir elegir por reserva "ciclo calendario" o "aniversario" desde el principio (requiere una columna nueva).
