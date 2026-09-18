import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GLOBAL_BRAND_LOCKUP_SRC } from "@/components/BrandMark";
import { AuthBrandPanel } from "@/components/branding/AuthBrandPanel";

const LOGIN_SCREENS = [
  "src/features/auth/pages/AuthPage.tsx",
  "src/features/portal/pages/PortalLogin.tsx",
];

/** Callsites globales de marca: deben usar el lockup local, nunca una URL. */
const GLOBAL_BRAND_CALLSITES = [
  "src/components/branding/AuthBrandPanel.tsx",
  "src/features/auth/pages/AuthPage.tsx",
  "src/features/portal/pages/PortalLogin.tsx",
  "src/layouts/CustomerPortalLayout.tsx",
  "src/layouts/sidebar/SidebarBranding.tsx",
];

describe("AuthBrandPanel — marca global en pantallas de acceso", () => {
  it("renderiza el lockup local fijo y el nombre global", () => {
    render(<AuthBrandPanel tagline="Levanta el futuro de tu operación." />);
    const img = screen.getByAltText("LiftGo Montacargas") as HTMLImageElement;

    expect(img.getAttribute("src")).toBe(GLOBAL_BRAND_LOCKUP_SRC);
    expect(screen.getAllByText("LiftGo").length).toBeGreaterThan(0);
  });

  it("no acepta ni renderiza un logo de empresa aunque se le pase", () => {
    const externo = "https://ejemplo-externo.test/logo.png";
    const props = {
      tagline: "t",
      logoUrl: externo,
      razonSocial: "Empresa B",
    } as unknown as {
      tagline: string;
    };
    const { container } = render(<AuthBrandPanel {...props} />);

    expect(container.innerHTML).not.toContain(externo);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("las pantallas de acceso de ERP y portal no consumen logo_url público", () => {
    for (const file of LOGIN_SCREENS) {
      // Se ignoran los comentarios: sólo importa el código renderizado.
      const source = readFileSync(resolve(process.cwd(), file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(source).not.toContain("logo_url");
      expect(source).not.toContain("usePublicBranding");
    }
  });

  it("todos los callsites globales usan el lockup local y ningún src remoto", () => {
    for (const file of GLOBAL_BRAND_CALLSITES) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(source).toContain("BrandLockup");
      expect(source).not.toContain("logo_url");
      expect(source).not.toMatch(/src=\{?["'`]?https?:/);
    }
  });

  it("ningún callsite global recolorea el logo oficial con filtros CSS", () => {
    for (const file of GLOBAL_BRAND_CALLSITES) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      // El lockup debe conservar sus colores originales: sin brightness/invert.
      expect(source).not.toContain("brightness-0");
      expect(source).not.toContain("invert");
    }
  });
});
