import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import type { GenerateMaintenanceResponse } from "../../../lib/maintenanceGenerationFeedback";
import { maintenanceLogKeys } from "../../../lib/queryKeys";
import { useGenerateRecurringMaintenance } from "../useGenerateRecurringMaintenance";

vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({ invokeEdgeFunction: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(), notifyInfo: vi.fn(), notifySuccess: vi.fn(), notifyWarning: vi.fn(),
}));

const complete: GenerateMaintenanceResponse = {
  generated: 2, skipped: 1, omitted_by_status: 0, month: "2026-10",
  failed_policies: 0, pending_remaining: 0, details: ["✓ Unidad 1 (2026-09-01)"],
};

function setup(result: GenerateMaintenanceResponse) {
  vi.mocked(invokeEdgeFunction).mockResolvedValue(result);
  const { Wrapper, queryClient } = createQueryWrapper();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const onResult = vi.fn();
  const hook = renderHook(() => useGenerateRecurringMaintenance(onResult), { wrapper: Wrapper });
  act(() => hook.result.current.mutate());
  return { ...hook, invalidate, onResult };
}

describe("generación de mantenimiento — resultado confirmado por el servidor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("avisa un resultado parcial, conserva el diagnóstico y actualiza registros creados", async () => {
    const response = { ...complete, failed_policies: 1, pending_remaining: 3, details: ["Error al insertar log"] };
    const { result, invalidate, onResult } = setup(response);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifyWarning).toHaveBeenCalledWith(expect.objectContaining({
      context: response, error: expect.objectContaining({ details: response.details }),
      action: expect.objectContaining({ label: "Ver resultado" }),
    }));
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyInfo).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: maintenanceLogKeys.all });
    expect(onResult).toHaveBeenCalledWith(response);
    expect(invokeEdgeFunction).toHaveBeenCalledTimes(1);
  });

  it("no confunde cero registros por error con ausencia de pendientes", async () => {
    const { result, invalidate } = setup({ ...complete, generated: 0, failed_policies: 1, pending_remaining: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifyWarning).toHaveBeenCalledTimes(1);
    expect(notifyInfo).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("advierte el tope de recuperación aunque no hubo errores", async () => {
    const { result } = setup({ ...complete, generated: 12, pending_remaining: 3 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifyWarning).toHaveBeenCalledTimes(1);
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("no da por completa una respuesta del servidor anterior al despliegue", async () => {
    const { result } = setup({ generated: 0, skipped: 0, month: "2026-10", details: ["Error al reclamar"] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifyWarning).toHaveBeenCalledTimes(1);
    expect(notifyInfo).not.toHaveBeenCalled();
  });

  it("confirma registros programados sin afirmar que el servicio se realizó", async () => {
    const { result, invalidate } = setup(complete);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifySuccess).toHaveBeenCalledWith(expect.stringContaining("programados"), expect.any(Object));
    expect(notifyWarning).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("informa que no hay nuevos registros sólo con un resumen completo", async () => {
    const { result } = setup({ ...complete, generated: 0, omitted_by_status: 1 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifyInfo).toHaveBeenCalledTimes(1);
    expect(notifyWarning).not.toHaveBeenCalled();
  });

  it("un fallo de transporte no abre un resultado ni invalida como si fuera éxito", async () => {
    vi.mocked(invokeEdgeFunction).mockRejectedValue(new Error("Function unavailable"));
    const { Wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const onResult = vi.fn();
    const { result } = renderHook(() => useGenerateRecurringMaintenance(onResult), { wrapper: Wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(onResult).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
