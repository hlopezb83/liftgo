import { describe, expect, it, vi } from "vitest";
import { readAllBillingPages } from "../invoices/useBookingBillingEvidence";

describe("complete billing evidence", () => {
  it("reads beyond one page and rejects errors or truncation instead of reopening periods", async () => {
    const read = vi.fn().mockResolvedValueOnce({ data: Array(1000).fill("row"), error: null }).mockResolvedValueOnce({ data: ["last"], error: null });
    expect(await readAllBillingPages(read)).toHaveLength(1001);
    expect(read).toHaveBeenNthCalledWith(2, 1000, 1999);
    await expect(readAllBillingPages(async () => ({ data: null, error: new Error("failed") }))).rejects.toThrow("failed");
    await expect(readAllBillingPages(async () => ({ data: Array(1000).fill("row"), error: null }))).rejects.toThrow(/historial completo/);
  });
});

describe("billing page cancellation", () => {
  it("does not start a read when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const read = vi.fn();
    await expect(readAllBillingPages(read, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
  });

  it.each([1, 1000])("rejects %i late rows after cancellation instead of returning partial evidence", async (count) => {
    const controller = new AbortController();
    let finish!: (value: { data: string[]; error: null }) => void;
    const read = vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const result = readAllBillingPages(read, controller.signal);
    controller.abort();
    finish({ data: Array(count).fill("row"), error: null });
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(read).toHaveBeenCalledOnce();
  });

  it("stops during the second page without returning the first successful page", async () => {
    const controller = new AbortController();
    const read = vi.fn().mockResolvedValueOnce({ data: Array(1000).fill("row"), error: null })
      .mockImplementationOnce(async () => {
        controller.abort();
        return { data: Array(1000).fill("late row"), error: null };
      });
    await expect(readAllBillingPages(read, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("rejects a partial page failure, never representing it as absence of claims", async () => {
    const failure = new Error("page two unavailable");
    const read = vi.fn().mockResolvedValueOnce({ data: Array(1000).fill("row"), error: null })
      .mockResolvedValueOnce({ data: null, error: failure });
    await expect(readAllBillingPages(read, new AbortController().signal)).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
