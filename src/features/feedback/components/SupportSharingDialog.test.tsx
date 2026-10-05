import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedbackReport } from "../hooks/useFeedbackReports";
import type { SupportCase } from "@/lib/platformSupport.types";
const state = vi.hoisted(() => ({ share: vi.fn(), withdraw: vi.fn(), refresh: vi.fn(), needsRefresh: false,
  query: { data: null as SupportCase | null, isPending: false, isFetching: false, isError: false, error: new Error("Sin conexión"), refetch: vi.fn() } }));
vi.mock("../hooks/useSupportSharing", () => ({ useSupportSharing: () => ({ query: state.query, needsRefresh: state.needsRefresh, refresh: state.refresh,
  share: { mutate: state.share, isPending: false, isError: false }, withdraw: { mutate: state.withdraw, isPending: false, isError: false },
}) }));
vi.mock("../hooks/useFeedbackScreenshotUrl", () => ({ useFeedbackScreenshotUrl: () => ({ data: null }) }));
import { SupportSharingDialog } from "./SupportSharingDialog";
const report: FeedbackReport = { id: "94000000-0000-4000-8000-000000000003", title: "Guardar disponibilidad", description: "Al guardar el cambio se pierde la selección",
  severity: "medium", folio: "FB-0001", screenshot_url: "private-path", context_json: { token: "unshared", route: "/fleet/private-id?token=unshared" },
  admin_notes: null, created_at: "2026-10-02T10:00:00Z", updated_at: "2026-10-02T10:00:00Z", module: "Flota", organization_id: "94000000-0000-4000-8000-000000000002",
  points_awarded: 0, reporter_id: "94000000-0000-4000-8000-000000000004", reporter_type: "internal", reporter_name: "Usuario CI", resolved_at: null, status: "new", type: "bug" };
describe("consentimiento de diagnóstico y captura", () => {
  beforeEach(() => { vi.resetAllMocks(); state.query.data = null; state.query.isError = false; state.needsRefresh = false; });
  it("requiere aceptación explícita y no adjunta automáticamente la captura o context_json", () => {
    render(<SupportSharingDialog report={report} onClose={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Compartir diagnóstico" });
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText(/Compartir también la captura/)).not.toBeChecked();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Revisé el diagnóstico/));
    expect(submit).toBeEnabled(); fireEvent.click(submit);
    expect(state.share).toHaveBeenCalledWith({ revision: "0", title: report.title, description: report.description,
      severity: "medium", requestId: null, screenshot: false }, expect.anything());
    expect(JSON.stringify(state.share.mock.calls)).not.toContain("unshared");
  });
  it("no deja enviar un requestId inválido incluso después de aceptar", () => {
    render(<SupportSharingDialog report={report} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Revisé el diagnóstico/));
    fireEvent.change(screen.getByLabelText("ID del error (opcional)"), { target: { value: "incorrecto" } });
    expect(screen.getByRole("button", { name: "Compartir diagnóstico" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("ID del error"); expect(state.share).not.toHaveBeenCalled();
  });
  it("no envía un formulario programáticamente mientras falta actualizar el resultado", () => {
    state.needsRefresh = true;
    render(<SupportSharingDialog report={report} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Revisé el diagnóstico/));
    fireEvent.submit(screen.getByRole("button", { name: "Compartir diagnóstico" }).closest("form")!);
    expect(state.share).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar caso" }));
    expect(state.refresh).toHaveBeenCalledOnce();
  });
  it("conserva el borrador al descubrir otra revisión y al fallar la actualización", () => {
    const tree = () => <SupportSharingDialog report={report} onClose={vi.fn()} />;
    const view = render(tree());
    fireEvent.change(screen.getByLabelText("Diagnóstico que recibirá soporte"), { target: { value: "Mi borrador pendiente de revisar" } });
    state.query.data = { revision: "2", title: "Diagnóstico vigente", description: "Texto confirmado por soporte", severity: "high", status: "waiting", shared: true, hasScreenshot: false } as SupportCase;
    view.rerender(tree());
    expect(screen.getByLabelText("Diagnóstico que recibirá soporte")).toHaveValue("Mi borrador pendiente de revisar");
    expect(screen.getByRole("button", { name: "Compartir diagnóstico" })).toBeDisabled();
    state.query.isError = true; state.needsRefresh = true;
    view.rerender(tree());
    expect(screen.getByLabelText("Diagnóstico que recibirá soporte")).toHaveValue("Mi borrador pendiente de revisar");
    expect(screen.getByRole("button", { name: "Cargar diagnóstico actual" })).toBeDisabled();
    state.query.isError = false; state.needsRefresh = false; view.rerender(tree());
    fireEvent.click(screen.getByRole("button", { name: "Cargar diagnóstico actual" }));
    expect(screen.getByLabelText("Diagnóstico que recibirá soporte")).toHaveValue("Texto confirmado por soporte");
    expect(screen.getByLabelText(/Revisé el diagnóstico/)).not.toBeChecked();
  });
});
