# "Error al crear factura" — la app publicada está atrasada

## Diagnóstico (verificado)

El reporte viene de la **versión 7.332.0**, que es lo que hay publicado hoy. El código actual del proyecto va en **7.363.0**.

El 25 de agosto se agregó una regla en la base de datos (`enforce_invoice_booking_period`) que rechaza cualquier factura ligada a una reserva sin periodo de facturación. La pantalla que pide ese periodo y lo valida antes de guardar se agregó en el front en la v7.333.0 — es decir, **una versión después de la que está publicada**.

Resultado: en la app publicada el usuario factura desde una reserva, el formulario ni siquiera muestra el campo "Periodo de facturación", y la base de datos rechaza el guardado con el mensaje técnico que aparece en el reporte. En el preview (7.363.0) el campo sí aparece y el error no ocurre.

Analogía: la cerradura de la puerta se cambió, pero al usuario todavía no le entregamos la llave nueva.

## Qué hacer

1. **Publicar la versión actual.** Eso solo ya elimina el error: el formulario publicado pasa a incluir el campo de periodo, se autollena con las fechas de la reserva seleccionada y valida antes de enviar.
2. **Red de seguridad en el formulario** (para que el rechazo de la base de datos nunca llegue crudo al usuario): si al guardar hay reserva seleccionada y el periodo quedó vacío, derivarlo de las fechas de la reserva en lugar de mandar nulo.
3. **Mensaje entendible**: mapear el código `23514` de esta regla a un texto de negocio ("Selecciona el periodo de facturación de la reserva") en lugar del texto técnico.

## Alcance técnico

- `src/features/invoices/hooks/invoiceForm/useInvoiceFormSubmit.ts`: fallback del periodo a partir de las reservas seleccionadas antes del insert.
- Mapa de errores de negocio de facturas: entrada para el mensaje del trigger `enforce_invoice_booking_period`.
- Prueba unitaria del fallback.
- Changelog y versión: `v7.363.1` (patch).
- Publicar al terminar.

## Nota sobre el trabajo en curso

El plan aprobado de reservas vencidas (badge "Vencida", filtro y aviso en Reservas, `v7.364.0`) sigue pendiente. Sugerencia de orden: primero este arreglo + publicación, luego reservas vencidas.
