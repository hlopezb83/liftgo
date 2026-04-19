

Reviso el PDF de cotizaciones (template maestro) y el actual de estado de cuenta para igualarlos.

El template maestro vive en `src/lib/pdf/quote/` con helpers reutilizables expuestos vía `src/lib/quotePdfPremium.ts`:
- `drawAccentBar` — barra naranja superior
- `drawPremiumHeader` — logo + razón social + RFC + título grande gris
- `drawInfoCardsAt` — tarjetas EMISOR / CLIENTE
- `drawPremiumTable` — tabla zebra con headers oscuros
- `drawBottomSection` — totales premium
- `drawFooter` — pie de página
- Paleta GRAY_900/700/500/400/200/100/50, MARGIN=20

El actual `customerStatementPdf.ts` usa estilo viejo: header naranja simple, tablas autoTable con fillColor naranja sólido, sin tarjetas emisor/cliente, sin barra de acento, sin tipografía premium.

# Plan: Rediseñar Estado de Cuenta con look premium

## Objetivo
Reemplazar `src/lib/customerStatementPdf.ts` para que use los mismos helpers del template maestro de cotizaciones.

## Cambios

### 1. Estructura nueva del PDF
1. **Barra de acento** (`drawAccentBar`) — naranja superior
2. **Header premium** (`drawPremiumHeader`) — logo + datos empresa + título "ESTADO DE CUENTA" + folio dinámico tipo `EC-{yyyyMMdd}`
3. **Tarjetas EMISOR / CLIENTE** (`drawInfoCardsAt`) — reutilizar pasando `isSale=true` para omitir período de renta
4. **Fila de detalles compacta** — Fecha de emisión + Periodo cubierto (rango de facturas) + badge de estado de saldo (PAGADO / CON SALDO / VENCIDO)
5. **Tres tarjetas de resumen** (estilo industrial minimalista, no naranja sólido):
   - Total Facturado
   - Total Pagado
   - Saldo Pendiente (color condicional: rojo si > 0, gris si = 0)
   - Fondo `GRAY_50`, borde `GRAY_200`, números grandes en `GRAY_900`
6. **Tabla "Facturas Pendientes"** con `drawPremiumTable` adaptada o autoTable con paleta gris (header `GRAY_900`, zebra `GRAY_50`):
   - Folio, Emisión, Vencimiento, Días vencidos, Estado, Total
   - Badge de estado con colores semánticos
7. **Tabla "Facturas Pagadas"** misma estética, header gris claro
8. **Sección de totales** estilo `drawBottomSection` minimalista al final
9. **Footer premium** (`drawFooter`) — uniforme con cotizaciones

### 2. Detalles visuales (tomados del maestro)
- Tipografía: `helvetica` con jerarquía FONT_XL/LG/MD/SM (14/10/8/6.5)
- Paleta exclusivamente gris + acento naranja en barra superior
- Sin colores planos saturados en tablas (eliminar `[232, 89, 12]` de headers)
- Espaciado consistente con MARGIN=20
- Badges con esquinas redondeadas (`roundedRect`)

### 3. Fecha y localización
- Mantener `nowMty()` y formato DD/MM/YYYY (memoria de localización MX)
- Mantener `formatCurrency` con MXN

### 4. Archivos a modificar
- `src/lib/customerStatementPdf.ts` → reescritura completa usando helpers premium
- `public/changelog.json` → nueva entrada **v5.30.1 (patch)**: "Estado de cuenta PDF rediseñado con estilo premium del template maestro"

### 5. QA visual
Tras implementar, generar un PDF de prueba mentalmente revisando:
- Que los helpers acepten los datos sin romper (algunos esperan estructura de cotización)
- Si `drawInfoCardsAt` no encaja 100%, replicar inline el patrón visual con misma paleta
- Que tabla de facturas pagadas no se solape con footer (control de salto de página)

## Notas técnicas
- `drawPremiumTable` está diseñada para line items de cotización (description/quantity/unit_price). Para tablas de facturas usaré `autoTable` directamente pero con la **paleta gris del maestro** (header `[17,24,39]`, alternateRow `[249,250,251]`, fontSize 8, sin naranja).
- `drawBottomSection` es para totales de venta; para estado de cuenta replicaré el patrón visual de tarjetas resumen alineadas a la derecha.
- Mantener compatibilidad con la firma actual `exportCustomerStatementPdf({ customer, summary })` — sin cambios en el llamador.

