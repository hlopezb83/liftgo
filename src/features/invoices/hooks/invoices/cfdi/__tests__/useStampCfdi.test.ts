import { renderHook, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type FunctionsInvokeResponse,
} from "@/test/helpers/supabaseChain";

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
import { invoiceKeys } from "../../../../lib/queryKeys";

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

  it("refresca el detalle activo una sola vez tras el éxito", async () => {
    stampResp = { data: { cfdi_uuid: "UUID-OK" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const detail = vi.fn(async () => ({ id: INVOICE_ID }));
    const { result } = renderHook(() => {
      const query = useQuery({ queryKey: invoiceKeys.detail(INVOICE_ID), queryFn: detail });
      return { stamp: useStampCfdi(), query };
    }, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    result.current.stamp.mutate(INVOICE_ID);
    await waitFor(() => expect(result.current.stamp.isSuccess).toBe(true));
    expect(detail).toHaveBeenCalledTimes(2);
  });

  it("propaga error de Facturapi (data.error)", async () => {
    stampResp = { data: { error: "Invalid RFC" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useStampCfdi(), { wrapper: Wrapper });
    result.current.mutate(INVOICE_ID);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("Invalid RFC");
  });

  it("202 pending informa sin anunciar timbrado exitoso", async () => {
    const appFeedback = await import("@/lib/ui/appFeedback");
    const notifyError = vi.mocked(appFeedback.notifyError);
    const notifyInfo = vi.mocked(appFeedback.notifyInfo);
    const notifySuccess = vi.mocked(appFeedback.notifySuccess);
    notifyError.mockClear();
    notifyInfo.mockClear();
    notifySuccess.mockClear();
    stampResp = { data: { error: "Facturapi aceptó el CFDI; timbrado pendiente de resolución.", code: "PAC_PENDING" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useStampCfdi(), { wrapper: Wrapper });
    result.current.mutate(INVOICE_ID);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyInfo).toHaveBeenCalledTimes(1);
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("actualiza el detalle cuando el backend solicita conciliación después del PAC", async () => {
    const appFeedback = await import("@/lib/ui/appFeedback");
    vi.mocked(appFeedback.notifyInfo).mockClear();
    vi.mocked(appFeedback.notifySuccess).mockClear();
    const context = Response.json({
      error: "No se pudo confirmar el registro",
      code: "STAMP_RECOVERY_REQUIRED",
    }, { status: 503 });
    stampResp = { data: null, error: Object.assign(new Error("Edge error"), { context }) };
    const { Wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useStampCfdi(), { wrapper: Wrapper });
    result.current.mutate(INVOICE_ID);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: invoiceKeys.detail(INVOICE_ID) });
    expect(appFeedback.notifyInfo).toHaveBeenCalledOnce();
    expect(appFeedback.notifySuccess).not.toHaveBeenCalled();
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

  it("R7 Bloque 12: 409 benigno se muestra como info y suprime notifyError", async () => {
    const appFeedback = await import("@/lib/ui/appFeedback");
    const notifyError = vi.mocked(appFeedback.notifyError);
    const notifyInfo = vi.mocked(appFeedback.notifyInfo);
    notifyError.mockClear();
    notifyInfo.mockClear();

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
    expect(notifyInfo).toHaveBeenCalledTimes(1);
    expect(notifyError).not.toHaveBeenCalled();
  });
});
