import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ list: vi.fn(), act: vi.fn(), error: vi.fn(), success: vi.fn(), validation: vi.fn(), warning: vi.fn() }));
vi.mock("@/lib/platformFiscalActions.functions", () => ({ listPlatformFiscalActionsFn: m.list, performPlatformFiscalActionFn: m.act }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: m.error, notifySuccess: m.success, notifyValidation: m.validation, notifyWarning: m.warning }));
import { PlatformFiscalJobActions } from "../components/PlatformFiscalJobActions";
import { PlatformAccessContext } from "../hooks/usePlatformAccess";
import { fiscalJob } from "./fiscalJob.fixture";
import type { FiscalJob } from "@/lib/platformFiscalJobs.types";
const job = { ...fiscalJob, configurationVerified: true, modeAtEnqueue: "test" as const, state: { ...fiscalJob.state, status: "exhausted" as const } };
function setup(canAct = true, currentJob: FiscalJob = job) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}><PlatformAccessContext.Provider value={{ isOperator: true, profile: "support", revision: "1",
    capabilities: canAct ? ["integrations.read", "integrations.retry"] : ["integrations.read"] }}>
    <PlatformFiscalJobActions job={currentJob} /></PlatformAccessContext.Provider></QueryClientProvider>);
  return cache;
}
describe("acciones de plataforma sin duplicar solicitudes ni activar formularios", () => {
  beforeEach(() => { vi.resetAllMocks(); m.list.mockResolvedValue([]); m.act.mockResolvedValue({ status: "pac_pending" }); });
  it("observador puede leer historial sin controles de acción", async () => {
    const cache = setup(false); await screen.findByText(/Todavía no hay consultas/);
    expect(screen.queryByRole("button", { name: "Consultar y conciliar" })).not.toBeInTheDocument(); cache.clear();
  });
  it("los dos botones son type button; valida un motivo sin enviar una consulta", async () => {
    const cache = setup(); await screen.findByText(/Todavía no hay consultas/);
    const button = screen.getByRole("button", { name: "Consultar y conciliar" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button); expect(m.validation).toHaveBeenCalled(); expect(m.act).not.toHaveBeenCalled(); cache.clear();
  });
  it("doble clic genera una sola operación y pending del PAC no se presenta como timbrado", async () => {
    let finish!: (value: { status: string }) => void;
    m.act.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const cache = setup(); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Comprobar factura pendiente" } });
    const button = screen.getByRole("button", { name: "Consultar y reprogramar si procede" });
    fireEvent.click(button); fireEvent.click(button); expect(m.act).toHaveBeenCalledTimes(1);
    finish({ status: "pac_pending" });
    await waitFor(() => expect(m.warning).toHaveBeenCalledWith(expect.stringMatching(/no volver a timbrar/)));
    expect(m.success).not.toHaveBeenCalled(); cache.clear();
  });
  it("un fallo de transporte conserva ID, revisión, motivo e intención al comprobar de nuevo", async () => {
    const cause = new Error("Fallo de transporte"); m.act.mockRejectedValueOnce(cause).mockResolvedValue({ status: "expired" });
    const cache = setup(); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Comprobar factura pendiente" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar y reprogramar si procede" }));
    await waitFor(() => expect(m.error).toHaveBeenCalledWith(expect.objectContaining({ error: cause })));
    const first = m.act.mock.calls[0][0].data;
    fireEvent.click(await screen.findByRole("button", { name: "Comprobar la misma solicitud" }));
    await waitFor(() => expect(m.act).toHaveBeenCalledTimes(2)); expect(m.act.mock.calls[1][0].data).toEqual(first); cache.clear();
  });
  it("un conflicto definitivo permite actualizar y generar una nueva solicitud", async () => {
    m.act.mockRejectedValueOnce(Object.assign(new Error("El trabajo cambió"), { status: 409 }));
    const cache = setup(); fireEvent.change(screen.getByRole("textbox"), { target: { value: "Comprobar factura pendiente" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar y conciliar" }));
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    const first = m.act.mock.calls[0][0].data.requestId;
    fireEvent.click(await screen.findByRole("button", { name: "Consultar y conciliar" }));
    await waitFor(() => expect(m.act).toHaveBeenCalledTimes(2)); expect(m.act.mock.calls[1][0].data.requestId).not.toBe(first); cache.clear();
  });
  it("al recargar un trabajo con reserva vencida permite liberarla, sin confundirlo con un cron activo", async () => {
    m.list.mockResolvedValue([{ id: "old", actorId: "operator", actorName: "Soporte", intent: "retry", reason: "Comprobar factura pendiente",
      status: "pending", startedAt: "2020-01-01T00:00:00Z", expiresAt: "2020-01-01T00:02:00Z", completedAt: null, expectedRevision: "1" }]);
    const cache = setup(true, { ...job, state: { ...job.state, status: "processing" } });
    await screen.findByText(/La consulta anterior venció/);
    expect(screen.getByRole("button", { name: "Consultar y conciliar" })).toBeEnabled(); cache.clear();
  });
  it("un trabajo retirado o de ambiente histórico desconocido no permite iniciar una operación", async () => {
    const cache = setup(true, { ...job, removed: true }); await screen.findByText(/Todavía no hay consultas/);
    expect(screen.getByRole("button", { name: "Consultar y conciliar" })).toBeDisabled(); cache.clear();
  });
  it("conocer el ambiente no acredita la llave usada en el intento original", async () => {
    const cache = setup(true, { ...job, configurationVerified: false }); await screen.findByText(/Todavía no hay consultas/);
    expect(screen.getByRole("button", { name: "Consultar y conciliar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Consultar y reprogramar si procede" })).toBeDisabled(); cache.clear();
  });
});
