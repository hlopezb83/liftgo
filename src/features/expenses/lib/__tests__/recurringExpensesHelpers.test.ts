import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

// Stable date so we control monthKey.
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    nowMty: () => new Date("2026-05-15T12:00:00Z"),
  };
});

import { buildRecurringInserts } from "../recurringExpensesHelpers";

function setupFrom({
  recurring,
  existing,
}: {
  recurring: Array<{ category: string; description: string | null; amount: number }> | null;
  existing: Array<{ category: string; description: string | null }>;
}) {
  // Sequence: 1st call → select("*").eq("is_recurring", true)
  //           2nd call → select("category, description").gte(...).lt(...)
  let call = 0;
  fromMock.mockImplementation(() => {
    call += 1;
    if (call === 1) {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: recurring, error: null }),
        }),
      };
    }
    return {
      select: () => ({
        gte: () => ({
          lt: () => Promise.resolve({ data: existing, error: null }),
        }),
      }),
    };
  });
}

describe("buildRecurringInserts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna null cuando no hay gastos recurrentes configurados", async () => {
    setupFrom({ recurring: [], existing: [] });
    const result = await buildRecurringInserts();
    expect(result).toBeNull();
  });

  it("genera inserts para gastos que aún no existen este mes", async () => {
    setupFrom({
      recurring: [
        { category: "renta", description: "Oficina", amount: 25000 },
        { category: "nomina", description: "Sueldos", amount: 80000 },
      ],
      existing: [],
    });
    const result = await buildRecurringInserts();
    expect(result).toHaveLength(2);
    expect(result?.[0]).toMatchObject({
      category: "renta",
      description: "Oficina",
      amount: 25000,
      is_recurring: true,
      expense_date: "2026-05-01",
    });
  });

  it("filtra los que ya existen este mes (match por categoría+descripción)", async () => {
    setupFrom({
      recurring: [
        { category: "renta", description: "Oficina", amount: 25000 },
        { category: "nomina", description: "Sueldos", amount: 80000 },
      ],
      existing: [{ category: "renta", description: "Oficina" }],
    });
    const result = await buildRecurringInserts();
    expect(result).toHaveLength(1);
    expect(result?.[0].category).toBe("nomina");
  });

  it("devuelve [] cuando todos los recurrentes ya existen", async () => {
    setupFrom({
      recurring: [{ category: "renta", description: "Oficina", amount: 25000 }],
      existing: [{ category: "renta", description: "Oficina" }],
    });
    const result = await buildRecurringInserts();
    expect(result).toEqual([]);
  });
});
