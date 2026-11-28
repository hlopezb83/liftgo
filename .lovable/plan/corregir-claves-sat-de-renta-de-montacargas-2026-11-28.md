# Corregir claves SAT de renta de montacargas

## Objetivo
Que las nuevas facturas de renta usen **78121604 – Servicio de arriendo o leasing de montacargas**, sin tocar facturas ya timbradas, impuestos ni logística (81141601).

## Cambios
1. **Catálogo**: agregar 78121604 con su etiqueta oficial y corregir la etiqueta engañosa de 78181500 (ya no decir "alquiler").
2. **Valores por defecto de renta** (pantalla): cambiar 78181500 → 78121604 en:
   - facturas desde reservas (`bookingRentalLines.ts`)
   - facturas desde cotizaciones (`quotedBookingLines.ts`)
   - extensiones (`useExtensionPrefill.ts`)
   - línea vacía del formulario (`invoiceFormSchema.ts`)
   - relleno automático (`invoiceSatDefaults.ts`)
3. **Respaldo al timbrar** (`stamp-cfdi/invoicePayload.ts`): el valor de reserva 78101803 (flete) pasa a 78121604 solo para líneas de renta sin clave; ventas conservan su propia lógica. Requiere desplegar `stamp-cfdi` tras tu autorización.
4. **Notas de crédito** (`creditNoteSourceValidation.ts`): el respaldo solo aplica si la factura origen no trae clave; se deja igual para no alterar notas de facturas históricas (las notas deben copiar la clave original).
5. **Pruebas**: actualizar/agregar pruebas puntuales de cada valor por defecto y snapshot del payload.
6. Changelog (minor), memoria de clave de renta, roadmap.

## Fuera de alcance
- Refacturar o cancelar facturas históricas (decisión del contador).
- Motor recurrente automático: se revisa si usa estas mismas funciones; si tiene su propio valor, se ajusta igual.

## Detalles técnicos
- Las claves explícitas guardadas en una línea siempre se respetan; solo cambian los valores por defecto.
- Validación: pruebas focales Vitest + `deno test` de stamp-cfdi; CI completa queda en GitHub Actions. No publicar ni desplegar sin autorización.
