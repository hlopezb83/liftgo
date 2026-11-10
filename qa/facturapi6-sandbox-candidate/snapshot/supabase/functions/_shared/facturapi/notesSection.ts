/**
 * 8.44.4: convierte las notas de la factura en `pdf_custom_section` de
 * Facturapi (HTML impreso en el PDF; no altera el XML fiscal).
 * Escapa HTML, conserva saltos de línea y recorta a un largo razonable.
 */
export const NOTES_SECTION_MAX = 2000;

export function buildNotesSection(notes: unknown): string | undefined {
  if (typeof notes !== "string") return undefined;
  const trimmed = notes.trim();
  if (!trimmed) return undefined;
  const clipped = trimmed.length > NOTES_SECTION_MAX
    ? `${trimmed.slice(0, NOTES_SECTION_MAX)}…`
    : trimmed;
  const escaped = clipped
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br>");
  return `<p><strong>Notas:</strong><br>${escaped}</p>`;
}
