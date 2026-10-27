import { useEffect, type RefObject } from "react";

function focusedQuoteField(form: HTMLFormElement, footer: HTMLDivElement) {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement) || !form.contains(field) || footer.contains(field)) return null;
  return field.matches("input, textarea, select, button[role=combobox]") ? field : null;
}

/** Keep focused quote fields clear of the sticky header and action bar. */
export function useQuoteFormVisibility(
  formRef: RefObject<HTMLFormElement | null>,
  footerRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const form = formRef.current;
    const footer = footerRef.current;
    if (!form || !footer) return;
    let frame = 0;
    const revealFocusedField = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = focusedQuoteField(form, footer);
        if (!field) return;
        const main = form.closest("#main-content");
        if (!(main instanceof HTMLElement)) return;
        const mainRect = main.getBoundingClientRect();
        const header = main.querySelector("[data-app-header]")?.getBoundingClientRect();
        const viewport = window.visualViewport;
        const top = Math.max(mainRect.top, header?.bottom ?? mainRect.top, viewport?.offsetTop ?? 0) + 12;
        const bottom = Math.min(mainRect.bottom, footer.getBoundingClientRect().top,
          viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 12;
        if (bottom <= top) return;
        const rect = field.getBoundingClientRect();
        const delta = rect.top < top ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
        if (delta) main.scrollBy({ top: delta, behavior: "auto" });
      });
    };
    form.addEventListener("focusin", revealFocusedField);
    window.addEventListener("resize", revealFocusedField);
    window.visualViewport?.addEventListener("resize", revealFocusedField);
    return () => {
      cancelAnimationFrame(frame);
      form.removeEventListener("focusin", revealFocusedField);
      window.removeEventListener("resize", revealFocusedField);
      window.visualViewport?.removeEventListener("resize", revealFocusedField);
    };
  }, [formRef, footerRef]);
}
