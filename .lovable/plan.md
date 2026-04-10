

## Simetría en sección Emisor / Cliente del PDF

### Problema
La sección de datos usa tamaños de fuente distintos entre emisor y cliente. El nombre del cliente usa `FONT_LG` (10) mientras el emisor usa `FONT_MD` (8). Las posiciones Y de cada campo (nombre, RFC, C.P.) no están alineadas — cada columna calcula su propia posición independientemente.

### Solución
Refactorizar `drawInfoCardsAt` para usar posiciones Y absolutas compartidas entre ambas columnas, y el mismo tamaño/peso de fuente para campos equivalentes:

```text
Y+4   EMISOR (FONT_SM, gray-500)          CLIENTE (FONT_SM, gray-500)
Y+10  Razón Social (FONT_MD, bold, 900)   Nombre Cliente (FONT_MD, bold, 900)
Y+15  RFC: xxx (FONT_MD, normal, 700)     RFC: xxx (FONT_MD, normal, 700)
Y+19  C.P. xxx (FONT_MD, normal, 700)     C.P. xxx (FONT_MD, normal, 700)
Y+23  Régimen: xxx (FONT_MD, normal, 700) Período/Vigencia (FONT_MD, normal, 700)
```

- Ambas columnas comparten las mismas coordenadas Y para cada fila
- Nombre del cliente baja de `FONT_LG` a `FONT_MD` bold (igual que emisor)
- Se elimina el cálculo independiente de `ey` y `cy` — se usa una sola variable `rowY` con incrementos fijos

### Archivos modificados
- `src/lib/quotePdfPremium.ts` — función `drawInfoCardsAt`
- `src/lib/changelog.ts` — entrada v5.14.2

