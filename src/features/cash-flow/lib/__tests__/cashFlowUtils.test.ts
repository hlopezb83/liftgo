import { describe, expect, it } from "vitest";
import { bucketByWeek, type CashFlowItem } from "../cashFlowUtils";

const today = new Date("2026-06-10T12:00:00"); // miércoles
const item = (over: Partial<CashFlowItem>): CashFlowItem => ({
  id: "x", number: "X", partyName: "P", dueDate: "2026-06-15", amountMxn: 100, kind: "in", navigatePath: "/", ...over,
});

describe("bucketByWeek", () => {
  it("agrupa vencidos en bucket 0 y futuros en su semana", () => {
    const items: CashFlowItem[] = [
      item({ id: "v", dueDate: "2026-06-01", amountMxn: 50, kind: "out" }),
      item({ id: "a", dueDate: "2026-06-10", amountMxn: 200, kind: "in" }),
      item({ id: "b", dueDate: "2026-06-22", amountMxn: 80, kind: "out" }),
    ];
    const buckets = bucketByWeek(items, today, 4, 1000, 500);
    expect(buckets[0].outflow).toBe(50);
    expect(buckets[1].inflow).toBe(200);
    // 2026-06-22 cae en la 3ra semana de horizonte (lunes 22 jun)
    expect(buckets[3].outflow).toBe(80);
  });

  it("aplica semáforo correcto sobre el acumulado", () => {
    const items: CashFlowItem[] = [item({ kind: "out", amountMxn: 600, dueDate: "2026-06-10" })];
    const buckets = bucketByWeek(items, today, 2, 1000, 500);
    expect(buckets[1].cumulative).toBe(400);
    expect(buckets[1].light).toBe("amber");
  });

  it("rojo cuando acumulado es negativo", () => {
    const items: CashFlowItem[] = [item({ kind: "out", amountMxn: 1500, dueDate: "2026-06-10" })];
    const buckets = bucketByWeek(items, today, 2, 1000, 500);
    expect(buckets[1].light).toBe("red");
  });
});
