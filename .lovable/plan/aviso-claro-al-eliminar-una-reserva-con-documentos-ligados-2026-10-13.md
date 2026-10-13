# Aviso claro al eliminar una reserva con documentos ligados

## Qué pasó
Hector intentó eliminar una reserva que ya tiene documentos (facturas, contratos, entregas, inspecciones o daños). El sistema lo bloqueó a propósito: eso es correcto y no se cambia.

El problema es el aviso: se presenta como "Error al eliminar reserva" con código de "permiso denegado" y se envía a monitoreo como incidente técnico, cuando en realidad es una regla de negocio. Además no dice qué hacer.

## Qué cambia
- El aviso se mostrará como bloqueo explicado, igual que "cancela primero":
  - Qué: No puedes eliminar esta reserva.
  - Por qué: Ya tiene documentos ligados (facturas, contratos, entregas, inspecciones o daños).
  - Siguiente paso: Cancela la reserva para conservar el historial; si necesitas quitar documentos, cancélalos o desvincúlalos primero.
- Ya no se reportará a monitoreo como fallo técnico.
- Sin cambios a la base de datos ni a la regla.

## Detalles técnicos
- `src/lib/rules/businessBlocks.data.ts`: nuevo código `booking_has_linked_documents` con copia es-MX y patrón `/tiene documentos ligados/i` en `ERROR_PATTERNS`.
- `src/lib/ui/errorDetailsExtract.ts`: los `P0001` no deben clasificarse como `DB_PERMISSION_DENIED`; revisar el clasificador para que excepciones de regla (P0001) usen un código de negocio/validación no accionable, evitando captura en Sentry. Confirmar que no rompe otros consumidores.
- Revisar el flujo de eliminación en `BookingActions.tsx` para que use `resolveBusinessBlock` en el `onError` y muestre el bloqueo.
- Pruebas puntuales: ampliar `bookingDeleteGuard.test.ts` y la prueba del clasificador.
- Changelogs a 8.43.25 (patch).
