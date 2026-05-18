/**
 * Calcula un selector CSS razonablemente único para un Element.
 * Sube por la cadena de padres hasta encontrar id o tope de 5 niveles.
 * Power of 10: pura, sin efectos, ≤80 LOC.
 */
export function computeCssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;

  while (node && node.nodeType === 1 && depth < 5) {
    const tag = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }

    let selector = tag;
    const cls = (node.getAttribute("class") || "")
      .split(/\s+/)
      .filter((c) => c && !c.startsWith("hover:") && !c.startsWith("focus:"))
      .slice(0, 2);
    if (cls.length) selector += "." + cls.map((c) => CSS.escape(c)).join(".");

    const parent = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === node?.tagName);
      if (sameTag.length > 1) {
        const idx = sameTag.indexOf(node) + 1;
        selector += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(selector);
    node = parent;
    depth += 1;
  }

  return parts.join(" > ");
}

export interface SelectedElementInfo {
  cssPath: string;
  tagName: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
}

export function describeElement(el: Element): SelectedElementInfo {
  const rect = el.getBoundingClientRect();
  const text = (el.textContent || "").trim().slice(0, 120);
  return {
    cssPath: computeCssPath(el),
    tagName: el.tagName.toLowerCase(),
    text,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  };
}
