import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToastDialogInset } from "../useToastDialogInset";

let height = 136;
let resized: () => void;
beforeEach(() => {
  height = 136;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  document.body.innerHTML = '<div data-toast-viewport="dialog" data-state="open"></div><ol class="toaster" data-sonner-toaster data-y-position="top" style="top:64px;--gap:14px"><li data-sonner-toast data-visible="true" data-expanded="false"></li></ol>';
  Object.defineProperty(document.querySelector("li"), "offsetHeight", { get: () => height });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("mobile dialog toast spacing", () => {
  it("reserva la altura del aviso y actualiza al cambiar su tamaño", async () => {
    const { unmount } = renderHook(() => useToastDialogInset(true));
    expect(document.documentElement.style.getPropertyValue("--toast-dialog-top")).toBe("calc(212px)");
    height = 184;
    resized();
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--toast-dialog-top")).toBe("calc(260px)"));
    unmount();
    expect(document.documentElement.hasAttribute("data-mobile-toast-inset")).toBe(false);
  });

  it("incluye los avisos expandidos y restaura el diálogo al cerrarlos", async () => {
    const { unmount } = renderHook(() => useToastDialogInset(true));
    const extra = document.createElement("li");
    extra.setAttribute("data-sonner-toast", "");
    extra.dataset.visible = "true";
    extra.dataset.expanded = "true";
    extra.style.setProperty("--offset", "150px");
    Object.defineProperty(extra, "offsetHeight", { value: 120 });
    document.querySelector("ol")!.append(extra);
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--toast-dialog-top")).toBe("calc(346px)"));
    document.querySelector("ol")!.remove();
    await waitFor(() => expect(document.documentElement.hasAttribute("data-mobile-toast-inset")).toBe(false));
    unmount();
  });

  it("no mueve diálogos de escritorio y limpia el espacio al cerrar el diálogo", async () => {
    const { rerender, unmount } = renderHook(({ mobile }) => useToastDialogInset(mobile), { initialProps: { mobile: false } });
    expect(document.documentElement.hasAttribute("data-mobile-toast-inset")).toBe(false);
    rerender({ mobile: true });
    expect(document.documentElement.hasAttribute("data-mobile-toast-inset")).toBe(true);
    document.querySelector("[data-toast-viewport]")!.setAttribute("data-state", "closed");
    await waitFor(() => expect(document.documentElement.hasAttribute("data-mobile-toast-inset")).toBe(false));
    unmount();
  });
});
