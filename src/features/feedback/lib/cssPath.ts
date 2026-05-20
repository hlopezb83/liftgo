import { finder } from "@medv/finder";

/**
 * Calcula un selector CSS único usando @medv/finder.
 * Genera selectores cortos, estables y verificadamente únicos en el DOM.
 */
export function computeCssPath(el: Element): string {
  try {
    return finder(el, {
      className: (name) =>
        !name.startsWith("hover:") &&
        !name.startsWith("focus:") &&
        !name.startsWith("active:") &&
        !name.startsWith("group-") &&
        !name.startsWith("peer-"),
      seedMinLength: 1,
      optimizedMinLength: 2,
    });
  } catch {
    return el.tagName.toLowerCase();
  }
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
