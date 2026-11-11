import { describe, expect, it } from "vitest";
import { dashboardPriority } from "../dashboardPriority";

describe("dashboard role priorities", () => {
  it("prioritizes dispatch and maintenance by role without changing permissions", () => {
    expect(dashboardPriority("dispatcher", false)).toBe("operations");
    expect(dashboardPriority("mechanic", false)).toBe("maintenance");
  });
  it.each(["admin", "administrativo", "auditor"] as const)("prioritizes collection for %s only when collection is authorized", (role) => {
    expect(dashboardPriority(role, true)).toBe("finance");
    expect(dashboardPriority(role, false)).toBe("overview");
  });
  it.each(["ventas", "customer", null, undefined] as const)("does not invent a financial profile for %s", (role) => {
    expect(dashboardPriority(role, false)).toBe("overview");
  });
});
