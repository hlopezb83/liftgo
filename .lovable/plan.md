# Estado actual y qué falta

## Ya cerrado en v7.95.0

- Fase 0 · limpieza: `applyRatesToBookings` eliminado + test viejo borrado.
- Fase 0 · tests que faltaban:
  - `useQuoteBookingCreator.test.ts` (2 casos: payload snake_case + manejo de error RPC).
  - `paymentIntentsRls.test.ts` (regresión: portal no puede UPDATE directo).
- Fase 1 · RLS del portal (BL-25/26): confirmado que `customer_payment_intents` sólo expone SELECT/INSERT a `customer`; aprobar/rechazar pasa por las RPCs SECURITY DEFINER.
- Changelog v7.95.0 publicado. 9/9 tests verdes.

## Lo que queda pendiente del plan original

1. **Test pgTAP para `convert_quote_to_bookings**` (Fase 0, punto 3 del plan): atomicidad ante fallo intermedio, rechazo por `status = accepted`, rechazo por arreglo vacío, marcado final a `accepted`. No lo ejecuté porque en Lovable Cloud no hay runner de SQL en CI; hoy la garantía viene sólo del `BEGIN/EXCEPTION` de la RPC + tests cliente.
2. **Cash Flow por método de pago** (Fase 1, backlog documentado en v7.95.0): desglose efectivo/transferencia/cheque/tarjeta en cobros y pagos a proveedores. Requiere nueva RPC + card en dashboard + test. Es feature, no bug.
3. **Ronda 2 de auditoría (BL-21..34)**: cerrada la parte transaccional y de reglas. Quedan dominios que la ronda 2 no tocó y podrían abrirse en una ronda 3 si quieres: notificaciones, storage/documentos, mecánicos/costo de mano de obra, colecciones automatizadas.

## Recomendación

Cortamos aquí el sprint de auditorías (v7.87 → v7.95) y elegimos uno de estos caminos para el siguiente turno:

- **A**: Implementar Cash Flow por método de pago (feature con impacto directo en el dashboard).
- **B**: Escribir el test pgTAP de `convert_quote_to_bookings` y armar infraestructura mínima para correr SQL tests en CI.
- **C**: Abrir ronda 3 de auditoría de lógica de negocio sobre los dominios no cubiertos.
- **D**: Pausar auditorías y atender lo próximo que traigas (bug report, feature nueva, etc.).

## Pregunta

¿Cuál de A / B / C / D seguimos, o prefieres cerrar el ciclo aquí? Continuamos hasta corregir todos los bugs BL