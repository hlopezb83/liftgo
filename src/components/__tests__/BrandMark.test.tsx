import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrandMark, GLOBAL_BRAND_INITIALS } from "@/components/BrandMark";

/**
 * La marca del producto debe salir SIEMPRE del asset global del repositorio.
 * Si alguien vuelve a cablear una URL (de `company_settings` o del RPC de
 * marca pública), estas pruebas fallan.
 */
const fetchSpy = vi.spyOn(globalThis, "fetch");

describe("BrandMark — marca global fija", () => {
  it("renderiza el distintivo global del repositorio, sin imágenes remotas", () => {
    const { container } = render(<BrandMark />);

    expect(screen.getByRole("img", { name: "LiftGo" })).toBeTruthy();
    expect(container.textContent).toContain(GLOBAL_BRAND_INITIALS);
    // Fuente fija: ni <img src>, ni descargas de red.
    expect(container.querySelector("img")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("es idéntica en cualquier tenant (no recibe ni acepta una URL)", () => {
    const a = render(<BrandMark size="sm" />).container.innerHTML;
    const b = render(<BrandMark size="sm" />).container.innerHTML;
    expect(a).toBe(b);
    expect(a).not.toMatch(/https?:/);
  });
});
