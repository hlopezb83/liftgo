## Objetivo

Rediseñar el PDF de **Estado de Resultados** para que use el mismo lenguaje visual premium minimalista industrial que el PDF de **Cotización**: paleta gris neutra, header con logo + barra de acento, tipografía consistente, tabla con header gris claro y filas zebra, totales destacados, footer corporativo y márgenes A4.

## Cambios visuales

| Elemento | Antes | Después (estilo cotización) |
|---|---|---|
| Orientación | Landscape A4, margen 14mm | Landscape A4, margen 20mm (consistente con quote) |
| Barra superior | (ninguna) | Barra de acento `GRAY_900` de 3mm en el tope |
| Header | Logo 18×18mm + título naranja `#E8590C` + período a la derecha | Logo escalado proporcionalmente (max 24×40mm), nombre empresa + RFC/régimen/CP a la izquierda; "ESTADO DE RESULTADOS" + período + fecha de emisión a la derecha; línea separadora gris |
| Tipografía | 7-16pt mezclado | `FONT_XL=14`, `FONT_LG=10`, `FONT_MD=8`, `FONT_SM=6.5` (Helvetica) |
| Header de tabla | Fondo `#F0F0F0` 8mm, texto `#333` 7pt | Fondo `GRAY_100` 9mm, label `GRAY_700` bold `FONT_SM`, separador `GRAY_200` |
| Filas | Sin zebra, separador 0.15 entre filas | Zebra alterna `GRAY_50`, subtotales con fondo `GRAY_100` y bold |
| Colores semánticos | Rojo `#DC3232` para costos, verde `#228B22` para deltas positivos | Mantener rojo/verde **solo** para signos financieros (costos negativos y deltas), todo lo demás `GRAY_900`/`GRAY_700` |
| Footer | (ninguno) | Línea separadora + "Documento generado electrónicamente — {empresa}" centrado en `GRAY_400` |
| Paginación | Reset a y=16 sin redibujar header | Re-dibuja barra de acento en cada nueva página y vuelve a pintar el header de tabla |

## Archivos a tocar

1. **`src/lib/pdf/incomeStatement/header.ts`** — reescribir `drawIncomeStatementHeader` reutilizando `drawAccentBar`, paleta y `getPngDimensions` desde `quote/constants` y `quote/header`. Reescribir `drawTableHeader` con altura 9mm, fondo `GRAY_100`, tipografía `FONT_SM` bold y separador `GRAY_200`.
2. **`src/lib/pdf/incomeStatement/rows.ts`** — usar paleta `GRAY_*` para texto neutral, `GRAY_50` para zebra (filas pares), `GRAY_100` + bold para subtotales. Mantener semántica de rojo/verde para costos y deltas. Tipografía `FONT_SM`/`FONT_MD`.
3. **`src/lib/pdf/incomeStatement.ts`** — orquestador:
   - `MARGIN = 20` (de `quote/constants`).
   - Llamar `drawAccentBar(doc)` antes del header y al inicio de cada página nueva.
   - Calcular `colW` con el nuevo margen.
   - Tras el loop, llamar a un nuevo `drawFooter` propio (o reutilizar el de `quote/totals` haciéndolo genérico — opción simple: copiar el patrón en línea para no acoplar la firma).
   - Subir altura mínima de fila a 5mm con padding consistente; redibujar header de tabla en páginas nuevas.
4. **`src/lib/changelog.ts`** + **`public/changelog.json`** — entrada patch "Rediseño PDF Estado de Resultados (estilo premium cotización)".

## Detalles técnicos

- Importar todos los tokens (`GRAY_*`, `FONT_*`, `MARGIN`, `getPngDimensions`) desde `@/lib/pdf/quote/constants` para mantener una sola fuente de verdad.
- Reutilizar `drawAccentBar` desde `@/lib/pdf/quote/header`.
- El título del header del documento será **"ESTADO DE RESULTADOS"** (uppercase, `FONT_LG` bold, `GRAY_700`) sobre el período (`FONT_XL` bold `GRAY_900`) — espejando la estructura "COTIZACIÓN / COT-XXXX" del PDF de cotización.
- Mantener intactas las firmas públicas: `exportIncomeStatementPdf(params)`, `IncomeStatementReport` no requiere cambios.
- No se modifican datos, RPC ni hooks. Solo capa de presentación PDF.

## QA

Tras el cambio, verificaré visualmente generando un PDF de ejemplo (vista mensual y comparativa) — revisando:
- Header con logo bien escalado y separador alineado.
- Header de tabla con fondo gris claro y columnas alineadas.
- Zebra correcta sin overlap.
- Subtotales destacados.
- Footer presente en todas las páginas.
- Sin recortes en el margen derecho de columnas numéricas.
