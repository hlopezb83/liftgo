import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useRevertAuditLog — operación destructiva: borra registro de auditoría y
 * revierte cambios. Restringida a admin por RLS. Si falla silenciosamente,
 * el operador cree que revirtió y no lo hizo.
 */

const { toastSuccess, notifyErrorMock } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  notifyErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: notifyErrorMock,
  notifySuccess: toastSuccess,
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

let rpcResp: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};
const rpcCalls: Array<{ name: string; args: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      revert_audit_log: (args) => {
        rpcCalls.push({ name: "revert_audit_log", args });
        return rpcResp;
      },
    },
  }),
}));

import { useRevertAuditLog } from "../useAuditLogs";

describe("useRevertAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcResp = { data: null, error: null };
    rpcCalls.length = 0;
  });

  it("revert exitoso → toast.success + invocación correcta de RPC", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRevertAuditLog(), { wrapper: Wrapper });

    result.current.mutate({ id: "log-1", tableName: "invoices" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcCalls).toEqual([
      { name: "revert_audit_log", args: { p_audit_log_id: "log-1" } },
    ]);
    expect(toastSuccess).toHaveBeenCalledWith(
      "Acción revertida y registro eliminado correctamente",
    );
  });

  it("RPC error → notifyError con mensaje del backend, no muestra success", async () => {
    rpcResp = { data: null, error: { message: "Solo administradores pueden revertir" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRevertAuditLog(), { wrapper: Wrapper });

    result.current.mutate({ id: "log-1", tableName: "invoices" });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(notifyErrorMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Error al revertir la acción",
    }));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("RPC error sin message → fallback a mensaje genérico", async () => {
    rpcResp = { data: null, error: { message: "" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRevertAuditLog(), { wrapper: Wrapper });

    result.current.mutate({ id: "log-1", tableName: "bookings" });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(notifyErrorMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Error al revertir la acción",
    }));
  });
});
