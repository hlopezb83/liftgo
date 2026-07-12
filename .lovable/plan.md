
# Auditoría e implementación de @react-pdf/renderer

## Auditoría de uso actual

`@react-pdf/renderer@^4.5.1` (versión estable más reciente de la línea v4; v5 aún no publicada).

**28 archivos** en `src/lib/pdf/**` y `src/features/**` consumen la librería. Distribución:

- **Documents** (5): `InvoiceDocument`, `QuoteDocument`, `ContractDocument`, `CustomerStatementDocument`, `IncomeStatementDocument` + subcomponentes de contrato.
- **Componentes reutilizables** (8): `Header`, `Footer`, `AccentBar`, `InfoCards`, `LineItemsTable`, `TotalsBox`, styles/tokens.
- **Builders** (5 `build.tsx`): `quote/build`, `contract/build`, `incomeStatement`, `customerStatement`, `features/invoices/lib/pdf/build`. Cada uno replica el mismo patrón `Promise.all([import("@react-pdf/renderer"), import("file-saver"), import("...Document")])` + `pdf(<Doc/>).toBlob()` + `saveAs()`.
- **Hooks/Botones de descarga** (5): `useQuotePdfDownload`, `useInvoicePdfDownload`, `ContractPDFButton`, `PortalStatement`, `IncomeStatementReport`. Todos hacen `import()` dinámico del `build.tsx` correspondiente.
- **Test**: `documents.smoke.test.tsx` mockea la librería a tags React planos.

**API en uso**: `Document`, `Page`, `Text`, `View`, `Image`, `StyleSheet.create`, `pdf().toBlob()`, props nativas `fixed` y `wrap={false}`. Nada deprecated. Nada de `PDFDownloadLink`, `PDFViewer`, `BlobProvider`, `usePDF`, `renderToStream`/`Buffer` (todo ok para SPA client-side lazy).

**Estado de imports**: 100% named imports por punto de entrada ESM raíz, ya tree-shakeables. `vite.config.ts` ya declara un `manualChunks` con grupo `react-pdf` (`{ name: "react-pdf", match: ["@react-pdf"] }`), así que la librería se carga una sola vez para las 5 descargas.

**Modernidad**: buena. Los patrones actuales son los recomendados por la doc oficial de v4. Los focos de mejora no están en la librería en sí sino alrededor:

## Modernización propuesta

Cuatro cambios reales, todos low-risk:

### 1. Helper unificado `renderAndSave` — elimina duplicación de los 5 builders

Los 5 `build.tsx` repiten:

```tsx
const [{ pdf }, { saveAs }, { XDocument }] = await Promise.all([
  import("@react-pdf/renderer"),
  import("file-saver"),
  import("@/lib/pdf/documents/XDocument"),
]);
const blob = await pdf(<XDocument {...props} />).toBlob();
saveAs(blob, filename);
```

Nuevo `src/lib/pdf/renderAndSave.tsx`:

```tsx
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

export async function renderAndSave(
  doc: ReactElement<DocumentProps>,
  filename: string,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const blob = await pdf(doc).toBlob();
  saveBlob(blob, filename);
}
```

Cada builder queda en 2 líneas efectivas. **Ahorro estimado: -30 LOC** repartidos en 5 archivos.

### 2. Eliminar `file-saver` (menos 1 dependencia)

`file-saver@2.0.5` es un shim histórico para IE10/Edge Legacy; en 2026 todos los navegadores soportan `<a download>` + `URL.createObjectURL`. Se sustituye por 8 líneas inline en `renderAndSave.tsx`:

```ts
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}
```

**Impacto bundle**: -1 dep (`file-saver`) + -1 dep de tipos (`@types/file-saver`), ~4 KB gzip menos, un import dinámico menos por descarga (más rápido).

### 3. Desactivar autohyphenation para textos en español

`@react-pdf/renderer` corta palabras con guiones automáticamente. En español eso produce cortes raros ("compra-venta" partido a medias, "manteni-miento", etc.), especialmente en contratos y estados de cuenta con párrafos largos.

La librería expone `Font.registerHyphenationCallback((word) => [word])` para desactivarlo. Se llama una única vez desde `renderAndSave.tsx` (o desde un módulo `bootstrap.ts` cargado por el helper):

```ts
import { Font } from "@react-pdf/renderer";
let bootstrapped = false;
function bootstrap() {
  if (bootstrapped) return;
  Font.registerHyphenationCallback((word) => [word]);
  bootstrapped = true;
}
```

Es una API nativa poco conocida, pensada exactamente para este caso.

### 4. Metadata consistente en `<Document>`

Aprovechar el helper para dejar constancia de origen: cuando la doc no traiga `producer`/`creator`, se puede aplicar al blob a través del propio JSX del document (los 5 documents pasarán `producer="LiftGo"` y `creator="LiftGo"`), o mejor: dejar cada `<Document title=…>` como está (ya lo tienen) y añadir los dos campos que faltan en un solo lugar. Cambio cosmético, opcional; se incluye por completitud de auditoría.

## Fuera de alcance (decidido)

- **`usePDF` / `PDFDownloadLink` / `PDFViewer` / `BlobProvider`**: cargarían la librería (~1.46 MB) en el bundle inicial. La estrategia actual `import()` dinámico + `pdf().toBlob()` es óptima para descargas one-shot.
- **`renderToStream` / `renderToBuffer` / `renderToFile`**: sólo Node. No aplica al SPA.
- **`Font.register` con TTF custom**: aumenta el bundle del chunk `react-pdf`. Helvetica base cubre bien es-MX en todas las pruebas del proyecto.
- **`<Svg>` / `<Canvas>` / `<Link>` / `<Note>` / `<PageNumber>`**: no requeridos por los 5 documents actuales.
- **Migración a v5**: no publicada aún; sin acción.

## Entregables

1. Nuevo `src/lib/pdf/renderAndSave.tsx` (helper + hyphenation bootstrap + saveBlob).
2. Refactor de los 5 `build.tsx` para consumir `renderAndSave`.
3. Remover `file-saver` y `@types/file-saver` de `package.json` (via `bun remove`).
4. Verificación:
   - `tsgo --noEmit`, `bun lint`, `bun test` (incluye `documents.smoke.test.tsx`, que ya mockea `Font.registerHyphenationCallback`).
   - `bun run build` con `ANALYZE=1` para confirmar que el chunk `react-pdf` sigue siendo lazy y que `file-saver` desaparece del grafo.
   - Playwright: descargar una cotización, una factura y un contrato desde el preview y verificar visualmente el PDF resultante (una sola pasada, tres artefactos).
5. Entrada de changelog **v7.51.0** (minor: reducción de superficie + calidad tipográfica).

## Estimación

~5 archivos tocados + 1 nuevo. -1 dependencia, -30 LOC netos, mejor tipografía en español. Sin cambios visibles fuera del hyphenation en párrafos largos.
