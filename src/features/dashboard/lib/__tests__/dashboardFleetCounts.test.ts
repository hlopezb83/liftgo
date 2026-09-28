import { beforeEach, describe, expect, it, vi } from "vitest";

const callRpcMock = vi.fn();
vi.mock("@/lib/rpc", () => ({
  callRpc: (...args: unknown[]) => callRpcMock(...args),
}));

import { dashboardStatsQueries } from "../queryKeys";

beforeEach(() => callRpcMock.mockReset());

describe("dashboard fleet totals", () => {
  it("uses complete server counts beyond the 500-row list cap", async () => {
    callRpcMock.mockImplementation((name: string) => Promise.resolve(
      name === "get_dashboard_stats"
        ? { fleet_counts: { total: 500, available: 400, rented: 100 }, invoice_stats: { breakdown: [] } }
        : { total: 610, available: 510, rented: 100, maintenance: 0, retired: 0, sold: 0 },
    ));

    const result = await dashboardStatsQueries.list().queryFn!({} as never);
    expect(result.fleet_counts).toEqual({
      total: 610, available: 510, rented: 100, maintenance: 0, retired: 0, sold: 0,
    });
    expect(callRpcMock).toHaveBeenCalledWith("get_dashboard_fleet_counts");
  });

});
