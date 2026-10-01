import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReportDamageForm } from "../useReportDamageForm";

const mocks = vi.hoisted(() => ({ save: vi.fn(), upload: vi.fn(), close: vi.fn(), success: vi.fn() }));
vi.mock("../useDamageRecords", () => ({ useSaveManualDamageReport: () => ({ mutateAsync: mocks.save, isPending: false }) }));
vi.mock("@/hooks/useDocuments", () => ({ useUploadDocument: () => ({ mutateAsync: mocks.upload, isPending: false }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: mocks.success }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValueOnce({ id: "damage-1", updated_at: "2026-10-01T12:00:00Z" })
    .mockResolvedValue({ id: "damage-1", updated_at: "2026-10-01T12:01:00Z" });
  mocks.upload.mockResolvedValue({ id: "photo-1" });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); });

async function prepare() {
  const hook = renderHook(() => useReportDamageForm(mocks.close));
  await act(async () => {
    hook.result.current.form.setValue("forkliftId", "forklift-1");
    hook.result.current.form.setValue("description", "Estimación inicial");
    hook.result.current.form.setValue("estimatedCost", 650);
  });
  return hook;
}

describe("reintento de un reporte manual", () => {
  it("actualiza el mismo registro con los campos corregidos después de retirar una foto fallida", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("Sin permisos"));
    const { result } = await prepare();
    act(() => { result.current.onDrop([new File(["photo"], "photo.png", { type: "image/png" })]); });
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.close).not.toHaveBeenCalled();
    act(() => {
      result.current.removePreview(0);
      result.current.form.setValue("description", "Estimación corregida");
      result.current.form.setValue("estimatedCost", 975);
    });
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ damageId: "damage-1", expectedUpdatedAt: "2026-10-01T12:00:00Z", description: "Estimación corregida", estimatedCost: 975 }));
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("espera todas las fotos y no vuelve a subir una que ya terminó", async () => {
    const first = new File(["one"], "one.png", { type: "image/png" });
    const second = new File(["two"], "two.png", { type: "image/png" });
    mocks.upload.mockImplementation(async ({ file }: { file: File }) => {
      if (file === second && mocks.upload.mock.calls.length <= 2) throw new Error("Conexión perdida");
      return { id: "uploaded" };
    });
    const { result } = await prepare();
    act(() => { result.current.onDrop([first, second]); });
    await act(async () => { await result.current.handleSubmit(); });
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.upload.mock.calls.filter(([input]) => input.file === first)).toHaveLength(1);
    expect(mocks.upload.mock.calls.filter(([input]) => input.file === second)).toHaveLength(2);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("un conflicto de versión conserva el formulario y no anuncia éxito", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("Conexión perdida"));
    const { result } = await prepare();
    act(() => { result.current.onDrop([new File(["photo"], "photo.png")]); });
    await act(async () => { await result.current.handleSubmit(); });
    mocks.save.mockRejectedValueOnce(new Error("El reporte cambió"));
    await act(async () => { await result.current.handleSubmit(); });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
});
