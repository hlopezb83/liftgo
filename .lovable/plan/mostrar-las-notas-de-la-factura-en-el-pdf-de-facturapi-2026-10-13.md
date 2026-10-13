## Mostrar las notas de la factura en el PDF de Facturapi

### Qué está pasando (confirmado)
El formulario guarda las notas en la factura y el PDF interno del ERP sí las muestra. Pero al timbrar, la función `stamp-cfdi` arma lo que se manda a Facturapi (cliente, conceptos, forma de pago, serie, folio…) **sin incluir las notas**. Por eso el PDF de Facturapi nunca las trae.

### Qué se va a hacer
1. Al timbrar, si la factura trae notas, mandarlas a Facturapi en el campo `pdf_custom_section`. Es una sección libre que sale impresa en el PDF y no altera el XML fiscal.
2. Limpiar el texto antes de mandarlo: escapar HTML, respetar saltos de línea y recortar a un largo razonable, para que ningún contenido raro rompa el PDF.
3. Si no hay notas, no mandar el campo; esas facturas se timbran igual que ahora.
4. Agregar pruebas puntuales: con notas se envía la sección escapada, sin notas no se envía.
5. Actualizar ambos changelogs (8.44.4, patch) y desplegar solo `stamp-cfdi`.

### Límites
- Solo cambian las facturas nuevas. Las facturas ya timbradas no se pueden modificar en Facturapi; sus notas seguirán viéndose solo en el PDF del ERP.
- Las notas de crédito y los complementos de pago quedan fuera, salvo que lo pidas.
- No hay timbrados de prueba en producción.

### Detalles técnicos
- `supabase/functions/stamp-cfdi/handler.ts`: agregar `pdf_custom_section` al `payload` a partir de `inv.notes`.
- Helper nuevo `buildNotesSection(notes)` en `_shared/facturapi/`, con prueba Deno.
