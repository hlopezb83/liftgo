import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BrandLockup,
  BrandMark,
  GLOBAL_BRAND_LOCKUP_SRC,
  GLOBAL_BRAND_LOGO_SRC,
} from "@/components/BrandMark";

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

describe("BrandLockup — lockup oficial LIFT GO MONTACARGAS", () => {
  it("el asset local versionado existe en el repositorio", () => {
    expect(
      existsSync(resolve(process.cwd(), "public/brand/liftgo-montacargas.png")),
    ).toBe(true);
    expect(GLOBAL_BRAND_LOCKUP_SRC).toBe("/brand/liftgo-montacargas.png");
  });

  it("renderiza el asset local y nunca una URL remota", () => {
    const { container } = render(<BrandLockup />);
    const img = container.querySelector("img") as HTMLImageElement;

    expect(img.getAttribute("src")).toBe(GLOBAL_BRAND_LOCKUP_SRC);
    expect(GLOBAL_BRAND_LOCKUP_SRC.startsWith("/")).toBe(true);
    expect(GLOBAL_BRAND_LOCKUP_SRC).not.toMatch(/^[a-z]+:|^\/\//i);
    expect(container.innerHTML).not.toMatch(/https?:/);
  });

  it("conserva la proporción del lockup (object-contain, ancho automático)", () => {
    const { container } = render(<BrandLockup size="lg" />);
    const img = container.querySelector("img") as HTMLImageElement;

    expect(img.className).toContain("object-contain");
    expect(img.className).toContain("w-auto");
  });

  it("es idéntica en cualquier tenant", () => {
    const a = render(<BrandLockup />).container.innerHTML;
    const b = render(<BrandLockup />).container.innerHTML;
    expect(a).toBe(b);
  });
});
