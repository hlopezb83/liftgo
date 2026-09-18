import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark, GLOBAL_BRAND_LOGO_SRC } from "@/components/BrandMark";

/**
 * La marca del producto debe salir SIEMPRE del asset gráfico local del
 * repositorio. Si alguien vuelve a cablear una URL (de `company_settings` o de
 * cualquier RPC de marca), estas pruebas fallan.
 */
describe("BrandMark — marca global gráfica y fija", () => {
  it("usa el asset gráfico local del repositorio", () => {
    render(<BrandMark />);
    const img = screen.getByAltText("LiftGo") as HTMLImageElement;

    expect(img.getAttribute("src")).toBe(GLOBAL_BRAND_LOGO_SRC);
    // Ruta del propio origen: nunca un host externo ni un esquema remoto.
    expect(GLOBAL_BRAND_LOGO_SRC.startsWith("/")).toBe(true);
    expect(GLOBAL_BRAND_LOGO_SRC).not.toMatch(/^[a-z]+:|^\/\//i);
  });

  it("es idéntica en cualquier tenant (no recibe ni acepta una URL)", () => {
    const a = render(<BrandMark size="sm" />).container.innerHTML;
    const b = render(<BrandMark size="sm" />).container.innerHTML;
    expect(a).toBe(b);
    expect(a).not.toMatch(/https?:/);
  });
});
