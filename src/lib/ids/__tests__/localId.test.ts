import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalId } from "../localId";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("non-security local identifiers", () => {
  it("prefers the native UUID API", () => {
    const randomUUID = vi.fn(() => "native-id");
    vi.stubGlobal("crypto", { randomUUID });
    expect(createLocalId()).toBe("native-id");
  });
  it("uses secure random bytes when randomUUID is missing or throws", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(255));
    vi.stubGlobal("crypto", { getRandomValues });
    expect(createLocalId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    vi.stubGlobal("crypto", { getRandomValues, randomUUID: () => { throw new Error("denied"); } });
    expect(createLocalId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(getRandomValues).toHaveBeenCalledTimes(2);
  });
  it.each([undefined, {}, { getRandomValues: () => { throw new Error("denied"); } }])("remains distinct without crypto even with frozen clock/random: %s", (crypto) => {
    vi.stubGlobal("crypto", crypto);
    vi.spyOn(Date, "now").mockReturnValue(42);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const ids = Array.from({ length: 100 }, createLocalId);
    expect(new Set(ids).size).toBe(100);
    expect(ids.every((id) => id.startsWith("local-"))).toBe(true);
  });
});
