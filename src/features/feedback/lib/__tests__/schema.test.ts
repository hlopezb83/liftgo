import { describe, it, expect } from "vitest";
import { feedbackFormSchema } from "../schema";

describe("feedbackFormSchema", () => {
  it("acepta payload válido", () => {
    const r = feedbackFormSchema.safeParse({
      type: "bug",
      title: "Botón no responde",
      description: "Al hacer clic en guardar no pasa nada después de 5 segundos.",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza title corto", () => {
    expect(
      feedbackFormSchema.safeParse({ type: "bug", title: "x", description: "descripción larga..." }).success,
    ).toBe(false);
  });

  it("rechaza description corta", () => {
    expect(
      feedbackFormSchema.safeParse({ type: "improvement", title: "Título OK", description: "corta" }).success,
    ).toBe(false);
  });

  it("rechaza tipo inválido", () => {
    expect(
      feedbackFormSchema.safeParse({ type: "other", title: "Título OK", description: "descripción larga..." }).success,
    ).toBe(false);
  });

  it("trim antes de validar longitud", () => {
    const r = feedbackFormSchema.safeParse({
      type: "bug",
      title: "    ",
      description: "descripción válida y larga",
    });
    expect(r.success).toBe(false);
  });
});
