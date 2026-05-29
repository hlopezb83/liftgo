## Objetivo
Corregir el problema visual de los botones del detalle de cotización: actualmente compiten con el título y los badges, provocando truncamiento y una distribución incómoda en desktop.

## Plan
1. Ajustar `DetailPageHeader` para que, cuando haya muchas acciones, use una estructura estable de dos filas:
   - Fila superior: botón regresar + título + badges.
   - Fila inferior: barra de acciones alineada y con wrap controlado.
2. Cambiar el criterio de colapso para que no dependa solo de móvil; en pantallas intermedias o cuando haya muchas acciones, mover acciones secundarias a un menú `Más acciones` si hace falta.
3. En `QuoteDetail`, definir una acción primaria visible según estado de la cotización:
   - `Aceptar` cuando está enviada.
   - `Facturar` cuando es venta aceptada pendiente de factura.
   - `Convertir a Reserva` cuando aplica.
   - El resto queda como acciones secundarias.
4. Mantener el comportamiento actual de los botones; solo se modifica presentación/layout, no reglas de negocio.
5. Actualizar changelog con una versión patch nueva al final del cambio.

## Resultado esperado
El título `COT-0052` dejará de verse cortado, los badges no quedarán encimados con botones, y la barra de acciones será más limpia y usable en desktop e intermedios.