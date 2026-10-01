import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importPreview } from "./catalogImport.fixture";
const state = vi.hoisted(() => ({ isPending: false, mutateAsync: vi.fn() }));
vi.mock("../hooks/usePlatformCatalogImport", () => ({ useImportCatalogCandidate: () => state }));
import { CatalogImportComparison } from "../components/catalogImport/CatalogImportComparison";
import { CatalogImportReviewForm } from "../components/catalogImport/CatalogImportReviewForm";

describe("revisión explícita y reintentos de maestros", () => {
  beforeEach(() => { vi.clearAllMocks(); state.isPending = false; });
  it("exige motivo y aceptación antes de incorporar", () => {
    render(<CatalogImportReviewForm preview={importPreview()} onDone={vi.fn()} onPendingChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Crear maestro global" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo de incorporación"), { target: { value: "Ficha revisada" } });
    expect(screen.getByRole("button", { name: "Crear maestro global" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Crear maestro global" })).toBeEnabled();
    expect(state.mutateAsync).not.toHaveBeenCalled();
  });
  it("conserva exactamente clave, motivo y revisión tras una respuesta perdida", async () => {
    state.mutateAsync.mockRejectedValue(new Error("network")); const done = vi.fn();
    render(<CatalogImportReviewForm preview={importPreview()} onDone={done} onPendingChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Motivo de incorporación"), { target: { value: "Ficha revisada para LiftGo" } });
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Crear maestro global" })));
    const first = state.mutateAsync.mock.calls[0][0];
    expect(screen.getByLabelText("Motivo de incorporación")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("No se confirmó el resultado");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reintentar incorporación" })));
    expect(state.mutateAsync.mock.calls[1][0]).toEqual(first); expect(done).not.toHaveBeenCalled();
  });
  it("la coincidencia se reutiliza sólo después de la revisión", async () => {
    state.mutateAsync.mockResolvedValue({}); const done = vi.fn();
    render(<CatalogImportReviewForm preview={{ ...importPreview(), status: "duplicate" }} onDone={done} onPendingChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Motivo de incorporación"), { target: { value: "Coincidencia revisada" } });
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Usar maestro existente" })));
    expect(state.mutateAsync.mock.calls[0][0].resolution).toBe("reuse"); expect(done).toHaveBeenCalledOnce();
  });
  it("muestra las diferencias técnicas sin inventar un valor para campos vacíos", () => {
    const preview = importPreview();
    render(<CatalogImportComparison preview={{ ...preview, status: "duplicate", match: { id: preview.source_id, name: "Atlas · Norte 30", is_active: true, data: { ...preview.source, capacity_kg: 3500, mast_height_m: null } } }} />);
    expect(screen.getByText("3000")).toBeVisible(); expect(screen.getByText("3500")).toBeVisible();
    expect(screen.getByText("—")).toBeVisible();
  });
});
