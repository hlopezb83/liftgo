

## Homologar PDF de Facturas al formato de Cotizaciones — v5.15.0

### Problema
El PDF de facturas usa un diseño propio con tarjetas "Receptor" y "Detalles", colores locales, y funciones legacy (`drawPremiumTotals`, `drawPremiumNotes`). El resultado es visualmente distinto al PDF de cotizaciones que ya tiene el diseño simétrico EMISOR/CLIENTE, logo proporcional, y totales+términos unificados.

### Solución
Reescribir `InvoicePDFButton.tsx` para reutilizar las mismas funciones del PDF de cotizaciones:

1. **Encabezado**: Usar `drawPremiumHeader(doc, company, logo, invoiceLabel, "FACTURA")` — mismo logo proporcional y layout
2. **CFDI badge**: Mantener el badge verde "TIMBRADO SAT" y UUID como sección adicional después del header (es específico de facturas)
3. **Sección info**: Reemplazar las tarjetas Receptor/Detalles por `drawInfoCardsAt()` con las dos columnas simétricas EMISOR/CLIENTE. Se necesita hacer fetch del RFC y C.P. del cliente, igual que en cotizaciones
4. **Datos adicionales de factura**: Agregar una fila compacta debajo de la info section con: fecha emisión, fecha vencimiento, status badge, forma/método de pago
5. **Tabla**: Ya usa `drawPremiumTable` — sin cambios
6. **Totales + Notas**: Reemplazar `drawPremiumTotals` + `drawPremiumNotes` por `drawBottomSection` que integra totales a la derecha y notas en caja full-width
7. **CFDI/QR**: Mantener la sección de QR placeholder y texto de verificación SAT al final
8. **Footer**: Ya usa `drawFooter` — sin cambios
9. **Eliminar constantes locales** (NAVY, GRAY_BG, etc.) del componente — todo viene de quotePdfPremium

### Detalle técnico

**`src/components/invoices/InvoicePDFButton.tsx`** — Reescritura del `handleDownload`:
- Importar `drawInfoCardsAt` y `drawBottomSection` en lugar de `drawPremiumTotals`/`drawPremiumNotes`
- Fetch customer RFC/CP (como hace QuotePDFButton)
- Flujo: `drawAccentBar` → `drawPremiumHeader("FACTURA")` → CFDI badge (si aplica) → `drawInfoCardsAt(emisor/cliente)` → fila de detalles factura (emitida, vence, status, pago) → `drawPremiumTable` → `drawBottomSection` → QR CFDI → `drawFooter`

**`src/lib/changelog.ts`** — Entrada v5.15.0

### Archivos modificados
- `src/components/invoices/InvoicePDFButton.tsx`
- `src/lib/changelog.ts`

