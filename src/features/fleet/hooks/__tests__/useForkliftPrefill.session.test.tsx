import { act, cleanup, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import type { Tables } from "@/integrations/supabase/types";
import { useForkliftPrefill } from "../forkliftForm/useForkliftPrefill";
import type { ForkliftFormData } from "../../lib/forkliftFormSchema";
import type { ReactNode } from "react";

const { notifyError } = vi.hoisted(() => ({ notifyError: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError }));
const original = { id: "equipment-a", name: "QA Equipo", manufacturer: "QA", model: "Modelo A", status: "available",
  fuel_type: "Diesel", daily_rate: 500, updated_at: "2026-01-01T00:00:00Z", notes: "Original" } as Tables<"forklifts">;
const newer = { ...original, daily_rate: 900, notes: "Versión remota", updated_at: "2026-02-01T00:00:00Z" };
function Wrapper({ children }: { children: ReactNode }) {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}
function setup(refetch = vi.fn().mockResolvedValue({ data: newer, error: null })) {
  const hook = renderHook(({ record, id, ready }) => {
    const form = useForm<ForkliftFormData>();
    const dirty = form.formState.isDirty;
    const session = useForkliftPrefill(id, record, form, ready, refetch);
    return { form, dirty, ...session };
  }, { initialProps: { record: original, id: original.id, ready: true }, wrapper: Wrapper });
  return { ...hook, refetch };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("sesión de edición de flota", () => {
  it("conserva captura y versión inicial tras un refetch con otro updated_at", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.record).toEqual(original));
    act(() => result.current.form.setValue("notes", "Captura local", { shouldDirty: true }));
    rerender({ record: newer, id: original.id, ready: true });
    expect(result.current.form.getValues("notes")).toBe("Captura local");
    expect(result.current.form.getValues("daily_rate")).toBe("500");
    expect(result.current.record?.updated_at).toBe(original.updated_at);
    expect(result.current.hasServerChanges).toBe(true);
  });

  it("rechazar la recarga conserva captura; aceptarla renueva valores y versión juntos", async () => {
    const { result, refetch } = setup();
    await waitFor(() => expect(result.current.record).toEqual(original));
    act(() => result.current.form.setValue("notes", "Captura local", { shouldDirty: true }));
    act(() => { void result.current.reload(); });
    fireEvent.click(await screen.findByRole("button", { name: "Seguir editando" }));
    await waitFor(() => expect(result.current.isReloading).toBe(false));
    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.form.getValues("notes")).toBe("Captura local");
    expect(result.current.record?.updated_at).toBe(original.updated_at);

    act(() => { void result.current.reload(); });
    fireEvent.click(await screen.findByRole("button", { name: "Recargar y descartar" }));
    await waitFor(() => expect(result.current.record?.updated_at).toBe(newer.updated_at));
    expect(result.current.form.getValues()).toMatchObject({ notes: newer.notes, daily_rate: "900" });
    expect(result.current.dirty).toBe(false);
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("una recarga fallida mantiene valores, dirty y candado original aunque tenga datos cacheados", async () => {
    const error = new Error("Fallo de lectura");
    const { result } = setup(vi.fn().mockResolvedValue({ data: newer, error }));
    await waitFor(() => expect(result.current.record).toEqual(original));
    act(() => result.current.form.setValue("notes", "Captura local", { shouldDirty: true }));
    act(() => { void result.current.reload(); });
    fireEvent.click(await screen.findByRole("button", { name: "Recargar y descartar" }));
    await waitFor(() => expect(result.current.isReloading).toBe(false));
    expect(result.current.form.getValues("notes")).toBe("Captura local");
    expect(result.current.record?.updated_at).toBe(original.updated_at);
    expect(result.current.dirty).toBe(true);
    expect(notifyError).toHaveBeenCalledWith({ error, title: "No se pudo recargar el equipo" });
  });

  it("espera el catálogo e ignora la respuesta de recarga al cambiar de equipo", async () => {
    let resolve!: (value: { data: typeof newer }) => void;
    const { result, rerender } = setup(vi.fn(() => new Promise<{ data: typeof newer }>(done => { resolve = done; })));
    await waitFor(() => expect(result.current.record).toEqual(original));
    act(() => { void result.current.reload(); });
    const other = { ...original, id: "equipment-b", notes: "Otro equipo" };
    rerender({ record: other, id: other.id, ready: false });
    expect(result.current.record).toBeNull();
    rerender({ record: other, id: other.id, ready: true });
    await waitFor(() => expect(result.current.record?.id).toBe(other.id));
    await act(async () => resolve({ data: newer }));
    expect(result.current.form.getValues("notes")).toBe("Otro equipo");
    expect(result.current.record?.id).toBe(other.id);
    expect(result.current.isReloading).toBe(false);
  });
});
