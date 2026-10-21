import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Papa from "papaparse";
import { exportToCsvGuarded } from "../exportCsv";
let click: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:csv");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("lets a cancellation queued during serialization run before browser download", async () => {
  let current = true;
  const unparse = Papa.unparse;
  vi.spyOn(Papa, "unparse").mockImplementation((data, config) => {
    setTimeout(() => { current = false; }, 0);
    return unparse(data, config);
  });
  const work = exportToCsvGuarded("private.csv", [{ name: "private" }], () => current);
  await vi.runAllTimersAsync(); await work;
  expect(click).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("downloads ordinary data once and revokes its object URL", async () => {
  const work = exportToCsvGuarded("valid.csv", [{ name: "QA", value: -10 }], () => true);
  await vi.runAllTimersAsync(); await work;
  expect(click).toHaveBeenCalledTimes(1); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv");
});
it("does not serialize when context is already invalid", async () => {
  const serialize = vi.spyOn(Papa, "unparse");
  await exportToCsvGuarded("no.csv", [{ name: "old" }], () => false);
  expect(serialize).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
});
