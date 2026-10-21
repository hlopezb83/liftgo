import { afterEach, expect, it, vi } from "vitest";
import { renderAndSave } from "../renderAndSave";
const state = vi.hoisted(() => ({ toBlob: vi.fn() }));
vi.mock("@react-pdf/renderer", () => ({
  Font: { registerHyphenationCallback: vi.fn() },
  pdf: () => ({ toBlob: state.toBlob }),
}));
afterEach(() => vi.restoreAllMocks());
it("does not create a download URL after the snapshot becomes stale while rendering", async () => {
  let release!: (blob: Blob) => void;
  state.toBlob.mockReturnValue(
    new Promise<Blob>((resolve) => {
      release = resolve;
    }),
  );
  const create = vi.spyOn(URL, "createObjectURL");
  let current = true;
  const result = renderAndSave(<div />, "report.pdf", () => current);
  const rejection = expect(result).rejects.toThrow("El reporte cambió");
  current = false;
  release(new Blob(["test"]));
  await rejection;
  expect(create).not.toHaveBeenCalled();
});
