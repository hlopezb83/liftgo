# Migración PDF → @react-pdf/renderer

Reemplazar el motor imperativo (jsPDF + jspdf-autotable + dibujo manual X/Y) por componentes React declarativos. Alcance: **todos** los generadores (Cotización, Factura, Contrato, Estado de Cuenta, Estado de Resultados) + preview en Dialog desde `QuoteDetail`.

## Resultado esperado

- Cero imports de `jspdf` o `jspdf-autotable` en `src/`.
- Generadores expresados como `<Document><Page>…</Page></Document>`.
- Una hoja de estilos central (`StyleSheet.create`) por tipo de documento, con tokens compartidos (colores, márgenes, tipografía).
- Textos largos (descripciones de partidas, cláusulas) envuelven con `wrap` sin romper layout.
- Botón **Previsualizar PDF** en `QuoteDetail` abre un Dialog con `<PDFViewer>` ocupando ~90vh.
- Botón "Descargar PDF" pasa a usar `pdf(<QuoteDocument …/>).toBlob()` + `file-saver` (o `saveAs` nativo) en lugar de `doc.save()`.

## Arquitectura nueva

```text
src/lib/pdf/
├── theme/
│   ├── styles.ts         ← StyleSheet.create() compartido (colores, type scale, spacing, table)
│   ├── tokens.ts         ← MARGIN, GRAY_*, font sizes
│   └── fonts.ts          ← Font.register (Inter / Helvetica fallback)
├── components/
│   ├── Header.tsx        ← AccentBar + logo + folio
│   ├── InfoCards.tsx     ← Tarjetas de cliente / emisor / vigencia
│   ├── LineItemsTable.tsx← Tabla con header sticky, zebra, wrap en descripción
│   ├── TotalsBox.tsx     ← Subtotal / IVA / Total
│   └── Footer.tsx        ← Datos fiscales + paginación (render="…")
└── documents/
    ├── QuoteDocument.tsx
    ├── InvoiceDocument.tsx
    ├── ContractDocument.tsx        ← multi-Page: Contrato, Anexo A (Checklist), Anexo B (Pagaré)
    ├── CustomerStatementDocument.tsx
    └── IncomeStatementDocument.tsx ← Page orientation="landscape"
```

Cada `documents/*.tsx` es una función pura `(props) => <Document>…</Document>`. Los datos se siguen obteniendo en los builders existentes (`buildQuotePdf`, etc.); el builder ahora se reduce a:

```ts
const blob = await pdf(<QuoteDocument {...data} />).toBlob();
saveAs(blob, `${quote.quote_number}.pdf`);
```

## Pasos de implementación

1. **Dependencias y limpieza**
   - `bun add @react-pdf/renderer file-saver` + `bun add -d @types/file-saver`
   - Pendiente al final: `bun remove jspdf jspdf-autotable` (solo cuando los 5 builders ya no los referencien).
   - Quitar entrada de `jsPDF lazy loaded` y nota "jsPDF locked at 4.0.0 max" del memory una vez removido.

2. **Theme + componentes compartidos** (`src/lib/pdf/theme/`, `src/lib/pdf/components/`)
   - Migrar paleta de `quote/constants.ts` (GRAY_50…900, MARGIN) a `tokens.ts` y exponerlos como `StyleSheet`.
   - `Font.register` para una familia (Inter regular/bold) servida desde `/public/fonts/`. Helvetica como fallback automático.
   - `LineItemsTable` usa `flexDirection: 'row'`, columna descripción con `flexGrow: 1` y `Text` sin `numberOfLines` para wrap natural.
   - `Footer` usa `<Text fixed render={({ pageNumber, totalPages }) => …} />` para paginación.

3. **Cotización (piloto + preview)**
   - Crear `documents/QuoteDocument.tsx` que reproduce el layout actual (header con logo + folio, info cards cliente/emisor/vigencia, tabla, totales, notas, footer).
   - Reescribir `src/lib/pdf/quote/build.ts`: mantiene fetch de `quotes`/`customers`/`company` y devuelve `<QuoteDocument />` → `pdf(...).toBlob()` → `saveAs`.
   - Eliminar `quote/header.ts`, `quote/table.ts`, `quote/totals.ts`, `quote/constants.ts` (migrado a theme) y el barrel `quoteGenerator.ts`.
   - **Preview**: nuevo `src/features/quotes/components/quotes/QuotePreviewDialog.tsx` con `<Dialog>` shadcn (max-w-6xl, h-[90vh]) que monta `<PDFViewer width="100%" height="100%"><QuoteDocument {...data} /></PDFViewer>`. Hook `useQuotePreviewData(quoteId)` reutiliza el fetch del builder.
   - Botón **"Previsualizar"** en `QuoteDetail` junto al actual "Descargar PDF". Lazy import del dialog (`React.lazy`) para no cargar `@react-pdf/renderer` en bundle base.

4. **Factura** (comparte 90% del layout)
   - `documents/InvoiceDocument.tsx` reutiliza `Header`, `InfoCards`, `LineItemsTable`, `TotalsBox`, `Footer`.
   - Reescribir `src/features/invoices/lib/pdf/build.ts`.
   - Borrar referencias a `quoteGenerator` desde el flujo de factura.

5. **Contrato** (3 secciones en un solo Document)
   - `documents/ContractDocument.tsx` con tres `<Page>`:
     - Página 1+: contrato (intro + declaraciones + 8 cláusulas + firmas). Usar `<View wrap>` para que cláusulas largas paginen automáticamente.
     - Página Anexo A: checklist (Datos generales + secciones dinámicas con checkboxes hechos con `<View style={styles.checkbox} />`).
     - Página Anexo B: pagaré.
   - El modo (`full | contract | checklist | pagare`) se resuelve renderizando condicionalmente `<Page>`s en lugar del hack `doc.deletePage(1)`.
   - Reemplazar `src/features/contracts/lib/contractPdfBuilder.ts` y eliminar `src/lib/pdf/contract/{contractPage,checklistPage,pagarePage,contractSections,sections/*}.ts`.
   - Mantener `fetchers.ts`, `placeholders.ts`, `placeholderRegistry.ts`, `data-templates.ts`, `data.ts` (lógica de datos pura, no PDF).

6. **Estado de Cuenta**
   - `documents/CustomerStatementDocument.tsx` con tarjetas resumen (3 cols flex), tabla facturas abiertas, tabla pagadas, badge de estatus.
   - Reescribir `src/lib/pdf/customerStatement.ts`; eliminar `customerStatement/{parts,tables}.ts`.

7. **Estado de Resultados** (landscape paginado)
   - `documents/IncomeStatementDocument.tsx` con `<Page orientation="landscape" size="A4">`. Las filas se renderizan con `<View>` por fila; react-pdf maneja salto de página con `wrap` + `<View break>` cuando excede.
   - Reescribir `src/lib/pdf/incomeStatement.ts`; eliminar `incomeStatement/{header,rows}.ts`.

8. **Limpieza final**
   - `bun remove jspdf jspdf-autotable`.
   - Verificar `rg "jspdf" src` → 0 matches.
   - Eliminar `src/lib/pdf/shared.ts#addWrappedText` y `checkPage` (helpers imperativos ya no usados); mantener `fetchCompanyDataAndLogo` y `loadImageAsBase64` (siguen sirviendo el logo).

9. **QA y validación**
   - `bunx vitest run` para asegurar que tests existentes pasan (los tests actuales no tocan PDF, así que deben seguir verdes).
   - QA visual manual: descargar un PDF de cada tipo desde la app, abrirlo, verificar: header con logo, márgenes, wrapping de descripciones largas, paginación, totales alineados, firmas/checklist completos.
   - Preview Dialog: abrir cotización en `/cotizaciones/:id`, clic en "Previsualizar", confirmar render idéntico al PDF descargado.

10. **Changelog + memoria**
    - `public/changelog.json`: nueva entrada `6.6.0-alpha.1` (major-architecture refactor, marcar como `minor` por compatibilidad UX).
    - `public/changelog/v6.6.0-alpha.1.json`: detalle por documento.
    - Actualizar `mem://tech/stack` (quitar jsPDF, agregar @react-pdf/renderer) y `mem://tech/security/vulnerabilities` (quitar lock de jsPDF 4.0.0).

## Detalles técnicos clave

- **Fuentes**: `Font.register({ family: 'Inter', fonts: [{ src: '/fonts/Inter-Regular.ttf' }, { src: '/fonts/Inter-Bold.ttf', fontWeight: 'bold' }] })`. Si las TTF no están disponibles, fallback a Helvetica (built-in en react-pdf).
- **Logo**: pasar como prop `logoBase64` (data URL); `<Image src={logoBase64} style={{ width: 60, height: 24, objectFit: 'contain' }} />` respeta el cap 24x40mm del memory de branding.
- **Wrap de texto**: `<Text>` envuelve por defecto. Para celdas de tabla con descripciones largas, envolver en `<View style={{ flex: 1 }}><Text>…</Text></View>` — sin `numberOfLines`.
- **Paginación**: cláusulas usan `<View wrap>` (default). Checklist y pagaré van en `<Page break>` para forzar nueva página.
- **Estado de Resultados** (tabla ancha): si #columnas > 12 se reduce `fontSize` dinámicamente (cálculo simple: `Math.max(6, 10 - Math.floor(cols/4))`).
- **Preview lazy**: `const QuotePreviewDialog = React.lazy(() => import('./QuotePreviewDialog'))` envuelto en `<Suspense fallback={<Spinner/>}>` — evita cargar `@react-pdf/renderer` (~400KB) en la ruta hasta que el usuario abra el preview.
- **Memoria a respetar**: paleta minimalista industrial, `formatCurrency` MXN es-MX, fechas `dd/MM/yyyy` con `nowMty()`, máximo 150 LOC por componente (los Document grandes se reparten entre `components/`).

## Riesgos

- **Tamaño del bundle**: `@react-pdf/renderer` pesa más que `jspdf`. Mitigación: lazy load tanto en builders (`await import('@react-pdf/renderer')`) como en el dialog.
- **Fidelidad pixel-perfect del contrato**: el contrato actual usa coordenadas absolutas. La nueva versión declarativa puede diferir en posicionamiento exacto de firmas. Aceptable porque mantiene contenido y orden; ajustes de spacing en QA.
- **Fuentes custom**: si no se sirven TTFs, se usa Helvetica (sin tilde correcta en algunos glifos). Mitigación: copiar Inter a `public/fonts/`.

## Entregables

- 5 documentos React (`QuoteDocument`, `InvoiceDocument`, `ContractDocument`, `CustomerStatementDocument`, `IncomeStatementDocument`).
- 1 theme + 5 componentes compartidos.
- 1 Dialog de preview en QuoteDetail.
- 5 builders simplificados (fetch + render + saveAs).
- Eliminación total de jsPDF.
- Changelog `v6.6.0-alpha.1`.
