import DOMPurify from "dompurify";
import { Marked } from "marked";

/**
 * Motor Markdown → HTML basado en `marked` (CommonMark + GFM opcional).
 * Reemplaza el parser artesanal a base de regex: obtenemos soporte real de
 * listas anidadas, code blocks, tablas, enlaces y escapes con ~10 LOC.
 *
 * El estilo visual lo aporta Tailwind Typography (`prose prose-sm`) desde el
 * wrapper en `renderSafeMarkdown()`, así el HTML producido queda limpio y
 * portable (sin clases inline).
 */
const marked = new Marked({
  gfm: true,
  breaks: true,
});

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/**
 * Whitelist estricta para el manual interno.
 * Anchors permitidos pero forzamos `rel="noopener noreferrer"` y `target="_blank"`
 * vía hook `uponSanitizeElement`.
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "span", "div",
    "strong", "em", "u", "s", "del",
    "ul", "ol", "li",
    "blockquote", "hr", "br",
    "code", "pre",
    "a",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  ALLOWED_ATTR: ["href", "title", "target", "rel"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,
};

// Hook: cualquier <a> resultante fuerza noopener/noreferrer + target=_blank.
let hookInstalled = false;
function ensureHook() {
  if (hookInstalled) return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("rel", "noopener noreferrer");
      node.setAttribute("target", "_blank");
    }
  });
  hookInstalled = true;
}

export function renderSafeMarkdown(md: string): string {
  ensureHook();
  const raw = renderMarkdown(md);
  const clean = DOMPurify.sanitize(raw, SANITIZE_CONFIG);
  return `<div class="prose prose-sm max-w-none dark:prose-invert">${clean}</div>`;
}
