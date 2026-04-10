

## Corregir proporciones del logo en PDF — v5.14.3

### Problema
El logo se renderiza como un cuadrado fijo de 16×16mm (`logoSize, logoSize`), distorsionando imágenes que no son cuadradas.

### Solución
En `drawPremiumHeader` de `src/lib/quotePdfPremium.ts`:

1. **Detectar dimensiones reales** — Crear un `Image()` temporal con el base64, leer `naturalWidth` y `naturalHeight` para calcular el aspect ratio
2. **Escalar proporcionalmente** — Fijar la altura máxima en 16mm y calcular el ancho como `16 * (naturalWidth / naturalHeight)`. Si el logo es más ancho que alto, fijar el ancho máximo en 24mm y calcular la altura
3. **Usar `addImage` con dimensiones correctas** — Reemplazar `(logoSize, logoSize)` por `(logoW, logoH)`

Como `jsPDF.addImage` acepta un base64 directamente, se puede usar la técnica de decodificar las dimensiones del PNG desde sus bytes (bytes 16-23 del header PNG contienen width y height en big-endian), evitando la necesidad de un `Image()` del DOM que no existe en todos los contextos.

### Detalle técnico
```typescript
// Extraer dimensiones del PNG desde el base64
function getPngDimensions(b64: string): { w: number; h: number } {
  const bin = atob(b64.replace(/^data:image\/\w+;base64,/, ""));
  // PNG header: bytes 16-19 = width, 20-23 = height (big-endian)
  const w = (bin.charCodeAt(16) << 24) | (bin.charCodeAt(17) << 16) | (bin.charCodeAt(18) << 8) | bin.charCodeAt(19);
  const h = (bin.charCodeAt(20) << 24) | (bin.charCodeAt(21) << 16) | (bin.charCodeAt(22) << 8) | bin.charCodeAt(23);
  return { w, h };
}

// En drawPremiumHeader:
const maxH = 16;
const { w: natW, h: natH } = getPngDimensions(logoBase64);
const ratio = natW / natH;
const logoH = maxH;
const logoW = maxH * ratio;
doc.addImage(logoBase64, "PNG", MARGIN, y - 2, logoW, logoH);
textStartX = MARGIN + logoW + 4;
```

### Archivos modificados
- `src/lib/quotePdfPremium.ts` — Agregar helper `getPngDimensions`, actualizar `drawPremiumHeader`
- `src/lib/changelog.ts` — Entrada v5.14.3

