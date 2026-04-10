

## Logo simétrico con texto del encabezado — v5.14.5

### Problema
El logo tiene un `maxH` fijo de 22mm, pero el texto a la derecha (título + número + fecha) ocupa desde `y` hasta `y + 14`, es decir ~16mm de altura total. El logo y el texto no se ven simétricos.

### Solución
En `drawPremiumHeader`, el bloque de texto a la derecha va de `y` a `y + 14` → 14mm de contenido, más ~2mm de padding visual = ~18mm. El separador está en `y + 24`.

Calcular la altura del logo para que coincida con la altura total del bloque de texto (desde el borde superior del título hasta la línea de fecha): **fijar `maxH` al mismo rango vertical que ocupa el texto** = `24mm` (desde `y - 2` hasta `y + 22`, cubriendo todo el espacio antes del separador). Aumentar `maxW` proporcionalmente a 40mm.

Centrar verticalmente el logo en ese espacio para que quede alineado con el bloque de texto.

### Cambios en `src/lib/quotePdfPremium.ts`
- Línea 90: `maxH = 22` → `maxH = 24`
- Línea 91: `maxW = 32` → `maxW = 40`
- Centrar logo verticalmente: calcular `logoY = y - 2 + (24 - logoH) / 2` en vez de fijar `y - 2`

### Archivos
- `src/lib/quotePdfPremium.ts` — ajustar dimensiones y centrado del logo
- `src/lib/changelog.ts` — entrada v5.14.5

