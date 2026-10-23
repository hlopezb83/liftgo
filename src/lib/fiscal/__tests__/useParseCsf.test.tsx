import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useParseCsf } from "../useParseCsf";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({ invokeEdgeFunction: invoke }));
beforeEach(() => { invoke.mockReset(); });
describe("shared fiscal CSF parser", () => {
  it("sends the PDF bytes unchanged and returns the fiscal contract", async () => {
    const data = { rfc: "XAXX010101000", razon_social: "EMPRESA QA", domicilio_fiscal_cp: "64000" };
    invoke.mockResolvedValue(data);
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(useParseCsf, { wrapper: Wrapper });
    const pdf = new File([new Uint8Array([37, 80, 68, 70, 0, 255])], "csf.pdf", { type: "application/pdf" });
    let parsed;
    await act(async () => { parsed = await result.current.mutateAsync(pdf); });
    expect(invoke).toHaveBeenCalledExactlyOnceWith("parse-csf", { body: { pdf_base64: "JVBERgD/" } });
    expect(parsed).toBe(data);
  });
  it("preserves service errors for the dropzone's existing feedback", async () => {
    const error = new Error("No se pudo leer la constancia");
    invoke.mockRejectedValue(error);
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(useParseCsf, { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(new File(["pdf"], "csf.pdf"))).rejects.toBe(error);
    });
  });
});
