# Correcciones de la auditoría funcional — 8.42.12

Base: `adc00f3f84112b62b5de899c7f26ea11e2aef208` (PR #149).

## Corregido en código

- **COM-03:** CRM convierte el valor de una cotización extranjera a MXN con su tipo de cambio. Una cotización sin TC válido no puede vincularse como si fuese MXN. Caso: 1,160 USD × 18.25 = 21,170 MXN.
- **COM-04:** el PDF contractual incluye `terms_text` como condiciones particulares antes de las firmas, conservando saltos de línea y la fuente contractual existente.
- **OP-02:** Lista y Tablero de mantenimiento comparten restricciones de lectura y estado terminal; sensores, arrastres, refacciones y mano de obra respetan esas restricciones. No cambia RLS.
- **COM-16:** Configuración conserva los catálogos de consulta y protege altas, cambios, bajas y formularios abiertos al perder acceso completo.
- **OP-04:** entrega e inspección formatean el instante en America/Monterrey; no descartan la hora al convertirlo a fecha civil.
- **COM-14:** los prospectos nuevos inician en Nuevo Prospecto. Los atajos de otras columnas no ofrecen una inserción que el servidor rechaza; las transiciones conservan sus reglas.
- **OP-05:** combustible requerido con valores válidos; los rechazos del servidor permanecen visibles dentro del diálogo sin borrar la captura.
- **OP-06:** el mes inclusivo habilita recurrencia, con pruebas de fin de mes y año bisiesto.
- **COM-15:** cotizaciones en tabla, tarjetas y selector CRM muestran código de moneda.
- **COM-11:** crédito del proveedor admite sólo enteros de 0 a 365 días.
- **COM-07 / OP-07:** tarjetas móviles de proveedores y devoluciones usan enlaces nativos con foco visible.
- **COM-08:** ayuda del interés moratorio 0% coincide con el pagaré.

## COM-02: corrección acotada y protección

La precarga de una factura desde reservas de una cotización con descuento conserva las partidas agrupadas originales **sólo para el periodo completo no recurrente**. El caso auditado de dos equipos y 10% vuelve a 10,441.56 (subtotal 9,001.35 + IVA por partida 1,440.21), en lugar de 11,601.74.

El descuento porcentual o fijo se reparte en centavos de forma estable entre las unidades cotizadas. No se aplica de nuevo a una base ya neta. El mapeo exige coincidencia de modelo, tarifas y número de reservas; datos antiguos o ambiguos, periodos modificados y metadatos contradictorios requieren revisión. El periodo efectivo de la factura se vuelve a validar al guardar.

**Pendiente:** automatizar descuentos para ciclos recurrentes y periodos parciales. La función `generate-recurring-invoices` excluye cotizaciones con cualquier descuento (incluidos extras) y explica el motivo en la vista previa. También excluye una fuente ausente o de otra organización. Es una contención deliberada del cobro incorrecto, no soporte completo de esos escenarios.

No hay migración ni actualización de facturas, reservas o cotizaciones existentes. La protección automática requiere desplegar la Edge Function, además del frontend.

## C-PDF-01: abierto

El encabezado invisible del Anexo A en CTR-0003 no se reprodujo localmente con el renderer Node ni con su edición browser. Se verificaron cuatro modos y un caso largo con Poppler y PDFium; condiciones y encabezados aparecen. No se cambió la composición del encabezado por una hipótesis. Falta regenerar y contrastar el mismo documento en la UI publicada.

## Validación

- Pruebas unitarias y de componentes offline para permisos, formularios, importes, fechas, accesibilidad y contratos.
- Render real de PDF en cuatro modos y documento largo; texto, encabezados y saltos de página inspeccionados.
- ESLint sin warnings, TypeScript y compilación local.
- Deno: formato, lint y comprobación de tipos de la función modificada, sin ejecutarla contra datos.
- La verificación funcional publicada se registra aparte; pruebas locales no equivalen a un despliegue.
