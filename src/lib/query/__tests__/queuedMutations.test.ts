import { QueryClient, onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

// Exercise the installed SDK, not mocks of MutationCache or resumePausedMutations.
describe("paused mutation queue compatibility", () => {
  afterEach(() => onlineManager.setOnline(true));

  it("resumes same-scope mutations once and preserves order after a failure", async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
    const calls: string[] = [];
    onlineManager.setOnline(false);
    const first = qc.getMutationCache().build(qc, {
      scope: { id: "invoice-test" },
      mutationFn: async () => { calls.push("first"); throw new Error("controlled failure"); },
    });
    const second = qc.getMutationCache().build(qc, {
      scope: { id: "invoice-test" },
      mutationFn: async () => { calls.push("second"); return "saved"; },
    });
    // Attach rejection handling immediately, before coming back online.
    const one = first.execute(undefined).catch((error: Error) => error.message);
    const two = second.execute(undefined);
    await vi.waitFor(() => {
      expect(first.state.isPaused).toBe(true);
      expect(second.state.isPaused).toBe(true);
    });
    expect(calls).toEqual([]);
    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    expect(await one).toBe("controlled failure");
    expect(await two).toBe("saved");
    expect(calls).toEqual(["first", "second"]);
    await qc.resumePausedMutations();
    expect(calls).toEqual(["first", "second"]);
    qc.clear();
  });
});
