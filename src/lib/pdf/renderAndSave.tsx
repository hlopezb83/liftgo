import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

/**
 * Bootstrap único de configuración global de @react-pdf/renderer:
 *
 * - `registerHyphenationCallback((w) => [w])` desactiva el corte automático de
 *   palabras (hyphenation). En español produce cortes incorrectos porque el
 *   algoritmo por defecto está calibrado para inglés. Devolver la palabra sin
 *   dividir es el patrón recomendado por la doc oficial para idiomas donde no
 *   se quiere autohyphenation.
 *
 * Se ejecuta lazy la primera vez que se renderiza un PDF para no cargar la
 * librería en el arranque del SPA.
 */
let bootstrapped = false;
async function bootstrap() {
  if (bootstrapped) return;
  const { Font } = await import("@react-pdf/renderer");
  Font.registerHyphenationCallback((word) => [word]);
  bootstrapped = true;
}

/**
 * Guarda un `Blob` como archivo usando `<a download>` + `URL.createObjectURL`.
 * Reemplaza a `file-saver`, que era un shim para IE/Edge Legacy (obsoleto en
 * 2026). Todas las plataformas modernas soportan este flujo nativo.
 */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Renderiza un `<Document>` de @react-pdf/renderer a Blob y lo descarga.
 *
 * Consolida el patrón repetido en los 5 builders (`quote/build.tsx`,
 * `contract/build.tsx`, `incomeStatement.tsx`, `customerStatement.tsx`,
 * `features/invoices/lib/pdf/build.tsx`). Importa `@react-pdf/renderer`
 * dinámicamente para preservar el code-splitting: el chunk `react-pdf`
 * (~1.46 MB) queda fuera del bundle inicial.
 *
 * Uso:
 * ```tsx
 * await renderAndSave(<QuoteDocument {...data} />, `${data.quoteNumber}.pdf`);
 * ```
 */
export async function renderAndSave(
  doc: ReactElement<DocumentProps>,
  filename: string,
): Promise<void> {
  const [{ pdf }] = await Promise.all([import("@react-pdf/renderer"), bootstrap()]);
  const blob = await pdf(doc).toBlob();
  saveBlob(blob, filename);
}
