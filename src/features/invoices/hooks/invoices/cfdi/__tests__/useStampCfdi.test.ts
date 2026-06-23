import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type FunctionsInvokeResponse,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

let stampResp: FunctionsInvokeResponse = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    functionsResolvers: {
      "stamp-cfdi": () => stampResp,
    },
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useStampCfdi } from "../useStampCfdi";

const INVOICE_ID = "inv-1";

describe("useStampCfdi", () => {
  beforeEach(() => {
    stampResp = { data: null, error: null };
  });

  it("happy path: devuelve cfdi_uuid", async () => {
    stampResp = { data: { cfdi_uuid: "UUID-OK", stub: false }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useStampCfdi(), { wrapper: Wrapper });
    result.current.mutate(INVOICE_ID);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.cfdi_uuid).toBe("UUID-OK");
  });

  it("propaga error de Facturapi (data.error)", async () => {
    stampResp = { data: { error: "Invalid RFC" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useStampCfdi(), { wrapper: Wrapper });
    result.current.mutate(INVOICE_ID);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Invalid RFC");
  });

  it("propaga error de transporte (functions.invoke error)", async () => {
    stampResp = { data: null, error: { message: "network down" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useStampCfdi(), { wrapper: Wrapper });
    result.current.mutate(INVOICE_ID);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("network down");
  });

  it("extrae el body JSON de FunctionsHttpError (409 Invoice already stamped)", async () => {
    const ctx = new Response(JSON.stringify({ error: "Invoice already stamped" }), {
      status: 409,
    });
    const err = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: ctx,
    });
    stampResp = { data: null, error: err as unknown as { message: string } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useStampCfdi(), { wrapper: Wrapper });
    result.current.mutate(INVOICE_ID);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Invoice already stamped");
  });
});
