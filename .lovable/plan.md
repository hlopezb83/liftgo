

## Rediseño del PDF de Cotizaciones — Layout industrial y simétrico

### Problema actual
El PDF actual tiene un diseño funcional pero carece de la estructura simétrica y el aspecto industrial-minimalista que se busca. Las notas aparecen como un bloque grande debajo de la tabla en vez de estar al lado de los totales, y la descripción de los equipos no muestra las especificaciones como viñetas dentro de la fila de la tabla.

### Cambios en `src/lib/quotePdfPremium.ts`

**1. Encabezado rediseñado** — `drawPremiumHeader`
- Izquierda: Nombre de empresa en texto grande bold sans-serif (simulando logotipo), con logo pequeño si existe
- Derecha: "COTIZACIÓN DE VENTA" en gris oscuro, número de cotización resaltado, fecha y vigencia
- Separador `<hr>` elegante debajo

**2. Sección de datos en 2 columnas** — `drawInfoCardsAt`
- Izquierda: Datos del emisor (razón social, RFC, C.P., dirección de la empresa)
- Derecha: Datos del cliente con etiqueta "CLIENTE", nombre en negrita, RFC, C.P.
- Sin fondo gris en las cards — diseño más limpio con solo tipografía

**3. Tabla con descripciones multi-línea** — `drawPremiumTable`
- Las notas de la cotización se parsean buscando especificaciones del equipo (viñetas) y se integran como sub-texto debajo de la descripción en cada fila
- Texto de specs en font más pequeño y color gris
- Sin líneas verticales, solo separadores horizontales sutiles
- Encabezado con fondo `bg-gray-100` claro en vez de navy oscuro

**4. Sección inferior en 2 columnas** — `drawTermsSection` + `drawPremiumTotals`
- Izquierda: Bloque de "TÉRMINOS, CONDICIONES Y NOTAS" con fondo gris claro y border radius, incluyendo las notas del usuario
- Derecha: Subtotal, IVA y TOTAL alineados a la derecha, total en texto grande bold
- Eliminar el box navy del total — usar solo tipografía grande con "$692,932.96 MXN"

**5. Pie de página simplificado** — `drawFooter`
- Texto centrado: "Documento generado electrónicamente - LIFT GO"

**6. Nuevo flujo de composición** — `QuotePDFButton.tsx`
- Pasar las notas a la sección de términos (columna izquierda) en vez de bloque separado
- Llamar una nueva función `drawBottomSection` que dibuje términos+notas a la izquierda y totales a la derecha en paralelo

### Paleta de colores
- Header de tabla: `rgb(243,244,246)` (gray-100) con texto oscuro
- Textos secundarios: `rgb(107,114,128)` (gray-500)
- Texto principal: `rgb(17,24,39)` (gray-900)
- Fondo términos: `rgb(249,250,251)` (gray-50)
- Sin dorado, sin navy — minimalismo industrial

### Archivos modificados
- `src/lib/quotePdfPremium.ts` — Rediseño completo de todas las funciones de dibujo
- `src/components/quotes/QuotePDFButton.tsx` — Ajustar flujo de composición para el nuevo layout de 2 columnas inferior
- `src/lib/changelog.ts` — Entrada v5.14.0

### Nota
Los cambios en `quotePdfPremium.ts` se mantienen retrocompatibles con `InvoicePDFButton.tsx` que también usa algunas de estas funciones. Las funciones que cambian de firma recibirán parámetros opcionales para no romper el PDF de facturas.

