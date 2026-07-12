import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

/**
 * Guardrail para tailwind-merge@3 + Tailwind v4.
 * Verifica que el resolver de colisiones sigue funcionando con las clases
 * tokenizadas que usamos en el design system (hsl(var(--...)), arbitrarias,
 * responsive y data-attrs).
 */
describe("cn (tailwind-merge v3 sanity)", () => {
  it("resuelve colisión de background tokenizado vs transparente", () => {
    const result = cn("bg-[hsl(var(--primary))]", "bg-transparent");
    expect(result).toBe("bg-transparent");
  });

  it("resuelve colisión de padding arbitrario vs escala estándar", () => {
    const result = cn("p-4", "p-[13px]");
    expect(result).toBe("p-[13px]");
  });

  it("mantiene variantes responsive independientes de la base", () => {
    const result = cn("text-sm", "md:text-lg", "text-base");
    expect(result).toBe("md:text-lg text-base");
  });

  it("mantiene variantes data-attr independientes de la base", () => {
    const result = cn("bg-muted", "data-[state=open]:bg-accent");
    expect(result).toBe("bg-muted data-[state=open]:bg-accent");
  });

  it("clsx: descarta falsy y deduplica clases idénticas", () => {
    const falsyFlag = false as boolean;
    const result = cn("flex", falsyFlag && "hidden", null, "flex", undefined);
    expect(result).toBe("flex");
  });
});
