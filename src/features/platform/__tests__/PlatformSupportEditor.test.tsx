import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportCase, SupportDetail } from "@/lib/platformSupport.types";
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
    const onRefresh = vi.fn().mockResolvedValue({ ...record, revision: "2", status: "waiting" });
    const tree = (item: SupportCase) => <QueryClientProvider client={cache}><PlatformSupportEditor record={item} assignees={[]} onRefresh={onRefresh} /></QueryClientProvider>;
    update.mockRejectedValue(new Error("El caso cambió"));
    const view = render(tree(record));
    fireEvent.change(screen.getByLabelText("Nota de seguimiento para soporte"), { target: { value: "Revisando el guardado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar seguimiento" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("El caso cambió"));
    expect(screen.getByLabelText("Nota de seguimiento para soporte")).toHaveValue("Revisando el guardado");
    expect(screen.getByRole("button", { name: "Guardar seguimiento" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar estado del caso" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Actualizar estado del caso" })).not.toBeInTheDocument());
    view.rerender(tree({ ...record, revision: "2", status: "waiting" }));
    expect(screen.getByRole("button", { name: "Guardar seguimiento" })).toBeDisabled();
    expect(screen.getByLabelText("Nota de seguimiento para soporte")).toHaveValue("Revisando el guardado");
    fireEvent.click(screen.getByRole("button", { name: "Cargar estado actual" }));
    expect(screen.getByLabelText("Estado")).toHaveValue("waiting");
    expect(screen.getByLabelText("Nota de seguimiento para soporte")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Guardar seguimiento" })).toBeEnabled();
  });
  it("publica la respuesta confirmada en caché sin presentar su propio guardado como conflicto", async () => {
    const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = ["platform", "support", "detail", record.id];
    const page: SupportDetail = { case: record, events: [], nextCursor: null, assignees: [] };
    cache.setQueryData(key, { pages: [page], pageParams: [null] });
    update.mockResolvedValue({ ...record, revision: "2", status: "resolved" });
    const tree = (item: SupportCase) => <QueryClientProvider client={cache}><PlatformSupportEditor record={item} assignees={[]} onRefresh={vi.fn()} /></QueryClientProvider>;
    const view = render(tree(record));
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "resolved" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar seguimiento" }));
    await screen.findByText("Seguimiento guardado.");
    expect(screen.queryByText(/El caso cambió/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar seguimiento" })).toBeEnabled();
    expect(cache.getQueryData<{ pages: SupportDetail[] }>(key)?.pages[0]?.case.revision).toBe("2");
    view.rerender(tree({ ...record, revision: "3", status: "waiting" }));
    expect(screen.getByRole("button", { name: "Guardar seguimiento" })).toBeDisabled();
    expect(screen.getByLabelText("Estado")).toHaveValue("resolved");
  });
  it("una actualización fallida no habilita repetir ni borra la nota", async () => {
    const cache = new QueryClient();
    update.mockRejectedValue(new Error("Respuesta perdida"));
    render(<QueryClientProvider client={cache}><PlatformSupportEditor record={record} assignees={[]} onRefresh={vi.fn().mockRejectedValue(new Error("Sin conexión"))} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Nota de seguimiento para soporte"), { target: { value: "Borrador conservado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar seguimiento" }));
    await screen.findByText("Respuesta perdida");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar estado del caso" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualizar estado del caso" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Guardar seguimiento" })).toBeDisabled();
    expect(screen.getByLabelText("Nota de seguimiento para soporte")).toHaveValue("Borrador conservado");
    expect(update).toHaveBeenCalledTimes(1);
  });
});
