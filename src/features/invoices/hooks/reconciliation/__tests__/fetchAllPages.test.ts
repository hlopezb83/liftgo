import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "../fetchAllPages";

describe("fetchAllPages", () => {
  it("retrieves every row across pages", async () => {
    const expected = Array.from({ length: 1001 }, (_, index) => index);
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: expected.slice(from, to + 1),
      error: null,
    }));

    await expect(fetchAllPages(fetchPage, 500)).resolves.toEqual(expected);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 499);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 500, 999);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 1000, 1499);
  });

  it("checks the next page when the result exactly fills a page", async () => {
    const expected = Array.from({ length: 500 }, (_, index) => index);
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: expected.slice(from, to + 1),
      error: null,
    }));

    await expect(fetchAllPages(fetchPage, 500)).resolves.toEqual(expected);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("propagates page query errors", async () => {
    const error = new Error("query failed");
    const fetchPage = vi.fn(async () => ({ data: null, error }));

    await expect(fetchAllPages(fetchPage, 500)).rejects.toBe(error);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid page sizes", async () => {
    const fetchPage = vi.fn();

    await expect(fetchAllPages(fetchPage, 0)).rejects.toThrow(RangeError);
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
