import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformEquipmentModelRow, PlatformPartCatalogRow } from "@/lib/platformCatalog.types";
const m = vi.hoisted(() => ({ modelSave: vi.fn(), partSave: vi.fn(), models: vi.fn(), parts: vi.fn() }));
vi.mock("@/lib/platformCatalog.functions", () => ({ savePlatformEquipmentModelFn: m.modelSave, savePlatformPartCatalogFn: m.partSave,
  listPlatformEquipmentModelsFn: m.models, listPlatformPartsCatalogFn: m.parts }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyValidation: vi.fn() }));
import { PlatformEquipmentModelDialog } from "../components/PlatformEquipmentModelDialog";
import { PlatformPartCatalogDialog } from "../components/PlatformPartCatalogDialog";
const model: PlatformEquipmentModelRow = { id: "10100000-0000-4000-8000-000000000011", manufacturer: "Toyota", model: "8FGU25",
  capacity_kg: 2500, mast_height_m: 4.5, fuel_type: "Diesel", specifications: { transmission: "automática" }, image_url: null, spec_sheet_url: null,
  is_active: true, organization_count: 2, created_at: "2026-10-03T10:00:00Z", updated_at: "2026-10-03T10:00:00.123456Z" };
const part: PlatformPartCatalogRow = { id: model.id, sku: "FLT-001", name: "Filtro hidráulico", description: null, manufacturer: "Toyota",
  oem_numbers: [], category: "Filtros", unit_of_measure: "pieza", image_url: null, equipment_model_ids: [model.id], is_active: true,
  organization_count: 2, created_at: model.created_at, updated_at: model.updated_at };
function setup(kind: "model" | "part") {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const close = vi.fn();
  render(<QueryClientProvider client={cache}>{kind === "model" ?
    <PlatformEquipmentModelDialog open model={model} onOpenChange={close} /> :
    <PlatformPartCatalogDialog open part={part} models={[model]} onOpenChange={close} />}</QueryClientProvider>);
  return { cache, close };
}
describe("captura global: accesibilidad, descarte y conflicto", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([["model", "Modelo *", "8FGU30"], ["part", "Nombre *", "Filtro de transmisión"]] as const)("protege borrador de %s al cerrar", async (kind, label, value) => {
    const { close, cache } = setup(kind);
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await screen.findByRole("alertdialog"); expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByLabelText(label)).toHaveValue(value);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await screen.findByRole("alertdialog"); fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(close).toHaveBeenCalledWith(false); cache.clear();
  });
  it.each([["model", "Modelo *", "8FGU30"], ["part", "Nombre *", "Filtro de transmisión"]] as const)("revisa una nueva base sin reemplazar borrador de %s", async (kind, label, value) => {
    const save = kind === "model" ? m.modelSave : m.partSave;
    const token = "2026-10-03T11:00:00.654321Z";
    m.models.mockResolvedValue([{ ...model, model: "8FGU32", specifications: { transmission: "manual" }, updated_at: token }]);
    m.parts.mockResolvedValue([{ ...part, name: "Filtro actual", updated_at: token }]);
    save.mockRejectedValueOnce(Object.assign(new Error("Los datos cambiaron"), { status: 409 }));
    const { close, cache } = setup(kind);
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("El contenido cambió mientras editabas");
    expect(save.mock.calls[0][0].data.expected_updated_at).toBe(model.updated_at);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar contenido actual" }));
    await screen.findByText(kind === "model" ? "8FGU32" : "Filtro actual");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Conservar mi captura y usar esta revisión" }));
    expect(screen.getByLabelText(label)).toHaveValue(value);
    save.mockResolvedValueOnce({ id: model.id });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(save.mock.calls[1][0].data.expected_updated_at).toBe(token);
    if (kind === "model") expect(save.mock.calls[1][0].data.specifications).toEqual({ transmission: "manual" });
    cache.clear();
  });
});
