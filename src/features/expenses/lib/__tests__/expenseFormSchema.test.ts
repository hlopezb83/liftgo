import { describe, it, expect } from "vitest";
import { expenseFormSchema } from "@/features/expenses/lib/expenseFormSchema";

describe("expenseFormSchema", () => {
  it("acepta gasto válido", () => {
    const r = expenseFormSchema.safeParse({
      expense_date: new Date("2026-05-26"),
      amount: 1500,
      category: "oficina",
      description: "Papelería",
    });
    expect(r.success).toBe(true);
  });

  it("coacciona strings numéricos a número", () => {
    const r = expenseFormSchema.safeParse({
      expense_date: new Date(),
      amount: "2500" as unknown as number,
      category: "renta",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(2500);
  });

  it("rechaza monto <= 0", () => {
    const r = expenseFormSchema.safeParse({
      expense_date: new Date(),
      amount: 0,
      category: "x",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes("mayor a 0"))).toBe(true);
    }
  });

  it("rechaza categoría vacía", () => {
    const r = expenseFormSchema.safeParse({
      expense_date: new Date(),
      amount: 100,
      category: "",
    });
    expect(r.success).toBe(false);
  });

  it("description tiene default ''", () => {
    const r = expenseFormSchema.parse({
      expense_date: new Date(),
      amount: 100,
      category: "x",
    });
    expect(r.description).toBe("");
  });

  it("rechaza amount no numérico", () => {
    const r = expenseFormSchema.safeParse({
      expense_date: new Date(),
      amount: "no-es-numero",
      category: "x",
    });
    expect(r.success).toBe(false);
  });
});
