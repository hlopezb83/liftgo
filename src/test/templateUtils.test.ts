import { describe, it, expect } from "vitest";
import { replacePlaceholders } from "@/lib/domain/templateUtils";

describe("replacePlaceholders", () => {
  it("reemplaza tokens con sintaxis brace por defecto", () => {
    const out = replacePlaceholders("Hola {nombre}, monto {monto}", {
      nombre: "Ana",
      monto: "$100",
    });
    expect(out).toBe("Hola Ana, monto $100");
  });

  it("conserva tokens desconocidos en sintaxis brace", () => {
    const out = replacePlaceholders("Hola {x} y {y}", { x: "1" });
    expect(out).toBe("Hola 1 y {y}");
  });

  it("reemplaza tokens con sintaxis bracket", () => {
    const out = replacePlaceholders("Cliente: [NAME] - [RFC]", { NAME: "Acme", RFC: "ABC123" }, "bracket");
    expect(out).toBe("Cliente: Acme - ABC123");
  });

  it("usa em dash cuando el valor bracket está vacío", () => {
    const out = replacePlaceholders("Rep: [REP]", { REP: "" }, "bracket");
    expect(out).toBe("Rep: —");
  });

  it("no rompe con strings sin placeholders", () => {
    expect(replacePlaceholders("texto plano", { a: "b" })).toBe("texto plano");
  });
});
