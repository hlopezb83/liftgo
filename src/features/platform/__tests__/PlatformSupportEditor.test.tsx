import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportCase } from "@/lib/platformSupport.types";
const update = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platformSupport.functions", () => ({ updatePlatformSupportFn: update }));
import { PlatformSupportEditor } from "../components/PlatformSupportEditor";
const record: SupportCase = { id: "94000000-0000-4000-8000-000000000001", organizationId: "94000000-0000-4000-8000-000000000002",
  organizationName: "Empresa CI", folio: "FB-0001", revision: "1", status: "new", severity: "medium", assigneeId: null, assigneeName: null,
  createdAt: "now", updatedAt: "now", shared: true, sharedUntil: "later", title: "Reporte", description: "Diagnóstico", module: "Flota", appVersion: "8.43.0", requestId: null, hasScreenshot: false };
describe("seguimiento concurrente: borrador y revisión", () => {
  beforeEach(() => vi.resetAllMocks());
  it("conserva el borrador ante conflicto y exige cargar el estado vigente", async () => {
    const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const tree = (item: SupportCase) => <QueryClientProvider client={cache}><PlatformSupportEditor record={item} assignees={[]} /></QueryClientProvider>;
    update.mockRejectedValue(new Error("El caso cambió"));
    const view = render(tree(record));
    fireEvent.change(screen.getByLabelText("Nota de seguimiento para soporte"), { target: { value: "Revisando el guardado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar seguimiento" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("El caso cambió"));
    expect(screen.getByLabelText("Nota de seguimiento para soporte")).toHaveValue("Revisando el guardado");
    view.rerender(tree({ ...record, revision: "2", status: "waiting" }));
    expect(screen.getByRole("button", { name: "Guardar seguimiento" })).toBeDisabled();
    expect(screen.getByLabelText("Nota de seguimiento para soporte")).toHaveValue("Revisando el guardado");
    fireEvent.click(screen.getByRole("button", { name: "Cargar estado actual" }));
    expect(screen.getByLabelText("Estado")).toHaveValue("waiting");
    expect(screen.getByLabelText("Nota de seguimiento para soporte")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Guardar seguimiento" })).toBeEnabled();
  });
});
