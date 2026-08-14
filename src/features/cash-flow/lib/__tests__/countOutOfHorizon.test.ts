import { describe, expect, it } from "vitest";
import { buildWeekBuckets, countOutOfHorizon, type CashFlowItem } from "../cashFlowUtils";

function item(id: string, dueDate: string): CashFlowItem {
  return {
    id,
    number: id,
    partyName: "X",
    dueDate,
    amountMxn: 100,
    kind: "in",
    navigatePath: "/",
  };
}

describe("countOutOfHorizon (F4)", () => {
  const today = new Date(2026, 0, 5); // lunes 2026-01-05
  const buckets = buildWeekBuckets(today, 2); // vencido + 2 semanas

  it("no cuenta vencidos ni dentro del horizonte", () => {
    const items = [item("a", "2026-01-01"), item("b", "2026-01-07"), item("c", "2026-01-14")];
    expect(countOutOfHorizon(items, buckets, "2026-01-05")).toBe(0);
  });

  it("cuenta los que vencen después del último bucket", () => {
    const items = [item("a", "2026-03-01"), item("b", "2026-02-20"), item("c", "2026-01-06")];
    expect(countOutOfHorizon(items, buckets, "2026-01-05")).toBe(2);
  });

  it("devuelve 0 sin partidas", () => {
    expect(countOutOfHorizon([], buckets, "2026-01-05")).toBe(0);
  });
});
