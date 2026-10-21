import { afterEach, expect, it, vi } from "vitest";
import { saveAccountantWorkbook } from "../writeWorkbook";
const state = vi.hoisted(() => ({ current: true }));
vi.mock("@e965/xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@e965/xlsx")>();
  return { ...actual, write: (...args: Parameters<typeof actual.write>) => {
    // Browser cancellation event becomes runnable while synchronous serialization executes.
    setTimeout(() => { state.current = false; }, 0);
    return actual.write(...args);
  } };
});
afterEach(() => vi.restoreAllMocks());
it("processes cancellation queued during XLSX serialization before download", async () => {
  state.current = true;
  const create = vi.spyOn(URL, "createObjectURL");
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  await expect(saveAccountantWorkbook([{ name: "Control", rows: [{ Valor: "synthetic" }] }], "test.xlsx", () => state.current)).rejects.toThrow("contexto");
  expect(create).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
});
