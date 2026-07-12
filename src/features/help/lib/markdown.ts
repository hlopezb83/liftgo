import DOMPurify from "dompurify";

/** Convierte un subset de Markdown a HTML con clases Tailwind. Liviano, sin deps externas. */
export function renderMarkdown(md: string): string {
  const html = md
    .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-semibold mt-4 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /^> (.+)$/gm,
      '<div class="border-l-4 border-primary/40 bg-muted/50 pl-3 py-1 my-2 text-sm rounded-r">$1</div>'
    )
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-5 list-decimal text-sm leading-relaxed">$2</li>')
    .replace(/^[-•] (.+)$/gm, '<li class="ml-5 list-disc text-sm leading-relaxed">$1</li>')
    .replace(/\n\n/g, '</p><p class="text-sm leading-relaxed mb-2">')
    .replace(/\n/g, "<br/>");

  return `<div class="prose-manual"><p class="text-sm leading-relaxed mb-2">${html}</p></div>`;
}

/**
 * Whitelist estricta: sólo las etiquetas que emite `renderMarkdown()` arriba.
 * Cualquier `<script>`, `<iframe>`, `<style>`, `<form>`, `<a href="javascript:...">`,
 * atributo `on*`, o vector similar queda fuera. `class` es el único atributo
 * permitido (los estilos vienen de Tailwind).
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["div", "p", "span", "h2", "h3", "h4", "strong", "em", "li", "br"],
  ALLOWED_ATTR: ["class"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

export function renderSafeMarkdown(md: string): string {
  return DOMPurify.sanitize(renderMarkdown(md), SANITIZE_CONFIG);
}
