import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock("@/lib/platformFiscalJobs.functions", () => ({ getPlatformFiscalJobFn: api.detail }));
vi.mock("@/lib/platformFiscalActions.functions", () => ({ listPlatformFiscalActionsFn: async () => [] }));
import { PlatformFiscalJobDetail } from "../components/PlatformFiscalJobDetail";
import { canAccessPlatformRoute } from "../hooks/usePlatformAccess";
import { fiscalJobGuidance } from "../lib/fiscalJobPresentation";
import { fiscalJob, fiscalJobDetail } from "./fiscalJob.fixture";
describe("historial fiscal y resultados no confirmados", () => {
  beforeEach(() => vi.resetAllMocks());
  it("no presenta cola succeeded como CFDI timbrado y preserva pendientes con ID sin UUID", () => {
    expect(fiscalJobGuidance(fiscalJob)).toMatch(/conciliación/);
    expect(fiscalJobGuidance({ ...fiscalJob, hasProviderId: false, documentStatus: "pending" })).toMatch(/no confirma/);
    expect(fiscalJobGuidance({ ...fiscalJob, documentAvailable: false })).toMatch(/no está disponible/);
  });
  it("la ruta exige integrations.read, incluso para un operador explícito", () => {
    const access = { isOperator: true, profile: "support" as const, revision: "1", capabilities: [] };
    expect(canAccessPlatformRoute(access, "/platform/fiscal-jobs")).toBe(false);
    expect(canAccessPlatformRoute({ ...access, capabilities: ["integrations.read"] }, "/platform/fiscal-jobs")).toBe(true);
  });
  it("muestra snapshot honestamente, conserva páginas y cursor bigint al cargar más", async () => {
    api.detail.mockResolvedValueOnce(fiscalJobDetail).mockResolvedValueOnce({ ...fiscalJobDetail, nextCursor: null,
      events: [{ ...fiscalJobDetail.events[0], id: "9007199254740991", kind: "queued" }] });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={cache}><PlatformFiscalJobDetail jobId={fiscalJob.id} onClose={() => {}} /></QueryClientProvider>);
    await screen.findByText("Instantánea inicial del trabajo existente");
    expect(screen.getByText(/no reconstruye intentos anteriores/)).toBeInTheDocument();
    expect(screen.getByText(/Revisa la conciliación/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cargar historial anterior" }));
    await screen.findByText("Trabajo registrado");
    expect(screen.getByText("Instantánea inicial del trabajo existente")).toBeInTheDocument();
    await waitFor(() => expect(api.detail).toHaveBeenLastCalledWith(expect.objectContaining({ data: { jobId: fiscalJob.id, before: "9007199254740992" } })));
    expect(screen.queryByRole("button", { name: /Timbrar|Reintentar|Reprogramar/ })).not.toBeInTheDocument();
    cache.clear();
  });
});
