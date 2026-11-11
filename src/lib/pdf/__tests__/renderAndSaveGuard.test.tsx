import { afterEach, expect, it, vi } from "vitest";
import { renderAndSave } from "../renderAndSave";
const state = vi.hoisted(() => ({ toBlob: vi.fn() }));
vi.mock("@/lib/exportInWorker", () => ({ exportInWorker: async () => undefined }));
vi.mock("../renderPdfBlob", () => ({ renderPdfBlob: state.toBlob }));
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
  const result = renderAndSave({ kind: "quote", props: {
    company: null, logoBase64: null, quoteNumber: "QA-1", customerName: null, customerRfc: null, customerCp: null,
    startDate: null, endDate: null, validUntil: null, isSale: false, lineItems: [], subtotal: 0, taxRate: 0,
    taxAmount: 0, total: 0, currency: "MXN", notes: null,
  } }, "report.pdf", () => current);
  const rejection = expect(result).rejects.toThrow("El reporte cambió");
  await vi.waitFor(() => expect(state.toBlob).toHaveBeenCalledOnce());
  current = false;
  release(new Blob(["test"]));
  await rejection;
  expect(create).not.toHaveBeenCalled();
});
