import { useEffect } from "react";

/** Reserve the toast's actual height above mobile dialogs, including stacks. */
export function useToastDialogInset(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const observed = new Set<Element>();
    let frame = 0;
    const clear = () => {
      root.removeAttribute("data-mobile-toast-inset");
      root.style.removeProperty("--toast-dialog-top");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; sync(); });
    };
    const resize = new ResizeObserver(schedule);
    const sync = () => {
      const dialog = document.querySelector('[data-toast-viewport="dialog"][data-state="open"]');
      const toaster = document.querySelector<HTMLElement>('.toaster[data-sonner-toaster][data-y-position="top"]');
      const toasts = toaster
        ? [...toaster.querySelectorAll<HTMLElement>('[data-sonner-toast][data-visible="true"]:not([data-removed="true"])')]
        : [];
      const targets = new Set<Element>(toasts);
      for (const target of observed) {
        if (!targets.has(target)) { resize.unobserve(target); observed.delete(target); }
      }
      for (const target of targets) {
        if (!observed.has(target)) { resize.observe(target); observed.add(target); }
      }
      if (!dialog || !toaster || !toasts.length) { clear(); return; }
      const style = getComputedStyle(toaster);
      const top = parseFloat(style.top) || 64;
      const gap = parseFloat(style.getPropertyValue("--gap")) || 14;
      // Ignore entry/exit animation transforms when reserving the final layout.
      const height = Math.max(...toasts.map((toast) => {
        const offset = toast.dataset.expanded === "true"
          ? parseFloat(toast.style.getPropertyValue("--offset")) || 0
          : (parseFloat(toast.style.getPropertyValue("--toasts-before")) || 0) * gap;
        return toast.offsetHeight + offset;
      }));
      const inset = `calc(${Math.ceil(top + height + 12)}px)`;
      if (root.style.getPropertyValue("--toast-dialog-top") !== inset) {
        root.style.setProperty("--toast-dialog-top", inset);
      }
      root.setAttribute("data-mobile-toast-inset", "");
    };
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["data-state", "data-visible", "data-expanded", "data-removed", "style"],
    });
    window.addEventListener("resize", schedule);
    sync();
    return () => {
      mutations.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      clear();
    };
  }, [enabled]);
}
