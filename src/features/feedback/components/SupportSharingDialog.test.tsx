import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedbackReport } from "../hooks/useFeedbackReports";
const state = vi.hoisted(() => ({ share: vi.fn(), withdraw: vi.fn() }));
vi.mock("../hooks/useSupportSharing", () => ({ useSupportSharing: () => ({
  query: { data: null, isPending: false, isError: false, refetch: vi.fn() },
  share: { mutate: state.share, isPending: false, isError: false },
  withdraw: { mutate: state.withdraw, isPending: false, isError: false },
}) }));
vi.mock("../hooks/useFeedbackScreenshotUrl", () => ({ useFeedbackScreenshotUrl: () => ({ data: null }) }));
import { SupportSharingDialog } from "./SupportSharingDialog";
const report: FeedbackReport = { id: "94000000-0000-4000-8000-000000000003", title: "Guardar disponibilidad", description: "Al guardar el cambio se pierde la selección",
  severity: "medium", folio: "FB-0001", screenshot_url: "private-path", context_json: { token: "unshared", route: "/fleet/private-id?token=unshared" },
  admin_notes: null, created_at: "2026-10-02T10:00:00Z", updated_at: "2026-10-02T10:00:00Z", module: "Flota", organization_id: "94000000-0000-4000-8000-000000000002",
  points_awarded: 0, reporter_id: "94000000-0000-4000-8000-000000000004", reporter_type: "internal", reporter_name: "Usuario CI", resolved_at: null, status: "new", type: "bug" };
describe("consentimiento de diagnóstico y captura", () => {
  beforeEach(() => vi.resetAllMocks());
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
    fireEvent.change(screen.getByLabelText("requestId (opcional)"), { target: { value: "incorrecto" } });
    expect(screen.getByRole("button", { name: "Compartir diagnóstico" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("UUID"); expect(state.share).not.toHaveBeenCalled();
  });
});
