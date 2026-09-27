# Renta facturada de extensiones — 8.42.15

Base: `447e57e481b0990155617dd4c313d87275b871c9` (8.42.14 / PR #152).

## Defecto confirmado en código y pruebas

`buildExtensionLineItems` genera conceptos como «MTY-LG-a — Extensión: Renta diaria (2026-10-04 al 2026-10-05)». El resumen contractual sólo reconocía el prefijo de renta ordinaria. Una factura exclusiva de extensión requería revisión; en una factura mixta podía omitir la extensión y publicar una cifra facturada inferior.

Ejemplo independiente: renta original 4,250.25 + dos días extra a 750.50 = 5,751.25 de renta; con logística 400.00, subtotal del documento 6,151.25. El resumen anterior mostraba 4,250.25; la corrección atribuye 5,751.25 y excluye logística. Si la extensión contiene un descuento de 10%, sus dos días quedan en 1,350.90, con renta total 5,601.15.

Se reconocen los formatos generados de renta ordinaria, recurrente y de extensión. La atribución por serie o nombre único mantiene las comprobaciones de vínculos, subtotal, descuentos y ambigüedad. No se calcula un descuento nuevo ni se cambia la regla de las tarifas de extensión.

También se detectó que una factura con un único vínculo podía ignorar un `booking_id` explícito contradictorio en la partida. Ese dato ahora exige un vínculo válido, igual que en una factura con varias reservas.

El contrato puede conservar sus fechas originales aunque la reserva se extienda. Comparar ese periodo anterior con todas las rentas facturadas de la reserva daría un balance engañoso. Se solicita revisar el acuerdo cuando las fechas del contrato difieren de la reserva actual, tanto con cotización como sin ella. No se cambia ni amplía automáticamente un contrato.

## Validación y límites

Doce regresiones nuevas reproducen diez fallos en el código anterior y comprueban la corrección, junto con las pruebas existentes de resumen, descuentos y cálculo de extensiones. Incluyen formatos reales del generador, nombres anteriores con serie, varias reservas, logística, descuentos, vínculo contradictorio, nombre ambiguo y un contrato con periodo anterior al de la reserva extendida.

No se modifican SQL, Edge Functions, tarifas ni facturas existentes. La atribución de extensiones emitidas se valida offline; no se emite CFDI para verificarla. Las comprobaciones de CI y la versión publicada se registran en el informe local.

COM-02 continúa pendiente para repartir descuentos entre ciclos y periodos parciales: falta la respuesta comercial sobre conservar y distribuir el neto cotizado, aplicando el descuento fijo una sola vez durante su vigencia. La generación automática con descuento mantiene su bloqueo.
