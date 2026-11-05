import { describe, expect, it } from "vitest";
import { isHistoricallyReconciled, selectDeliveryHistory } from "../historicalReconciliation";
import { countOverdueDeliveries } from "../deliveryOverdue";

import { reconciliation } from "./historicalReconciliation.fixture";
describe("historical delivery visibility", () => {
  const active = { id: "active", status: "scheduled", scheduled_date: "2020-01-01", historical_reconciliation: reconciliation };
  const pending = { ...active, id: "pending", historical_reconciliation: null };
  const revoked = { ...active, id: "revoked", historical_reconciliation: { ...reconciliation, revoked_at: "2026-11-06T00:00:00Z" } };
  it("separates pending and history without changing logistics status", () => {
    expect(selectDeliveryHistory([active, pending, revoked], "all")).toEqual([pending, revoked]);
    expect(selectDeliveryHistory([active, pending, revoked], "reconciled")).toEqual([active]);
    expect(selectDeliveryHistory([active, pending, revoked], "history")).toHaveLength(3);
    expect(active.status).toBe("scheduled");
  });
  it("excludes only active reconciliations from overdue count", () => {
    expect(countOverdueDeliveries([active, pending, revoked])).toBe(2);
    expect(isHistoricallyReconciled(revoked)).toBe(false);
    expect(isHistoricallyReconciled({})).toBe(false);
  });
});
