import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountantExportReport } from "../AccountantExportReport";

const state = vi.hoisted(() => ({
  financial: true, organization: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", identity: "user:A", permissions: new Set(["Reportes", "Facturas"]),
  package: vi.fn(), savePackage: vi.fn(), fetch: vi.fn(), save: vi.fn(), branding: vi.fn(), success: vi.fn(),
}));
vi.mock("@/features/users", () => ({ useHasFinancialAccess: () => state.financial, useHasModuleAccess: (module: string) => state.permissions.has(module) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => state.organization }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => state.identity }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: state.success }));
vi.mock("@/lib/pdf/shared", () => ({ fetchCompanyDataAndLogo: state.branding }));
vi.mock("../../../lib/accountantExport/fetchData", () => ({ fetchAccountantData: state.fetch }));
vi.mock("../../../lib/accountantExport/buildSheets", () => ({ buildAccountantSheets: () => [{ name: "Control", rows: [] }] }));
vi.mock("../../../lib/accountantExport/writeWorkbook", () => ({ saveAccountantWorkbook: state.save }));
vi.mock("../../../lib/accountantExport/buildPackage", () => ({ buildAccountantPackage: state.package, saveAccountantPackage: state.savePackage }));
const dates = { startDate: new Date(2026, 9, 1), endDate: new Date(2026, 9, 31) };
const pending = <T,>() => { let resolve: (value: T) => void = () => {}; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => {
  state.financial = true; state.organization = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; state.identity = "user:A";
  state.permissions = new Set(["Reportes", "Facturas"]);
  state.package.mockReset().mockResolvedValue({ incomplete: true, included: 1, missing: 1 }); state.savePackage.mockReset();
  state.fetch.mockReset().mockResolvedValue({}); state.save.mockReset().mockResolvedValue(undefined);
  state.branding.mockReset().mockResolvedValue({ company: { razon_social: "A", rfc: "AAA" } }); state.success.mockReset();
});
it("requests only selected readable sections and does not query denied sections", async () => {
  render(<AccountantExportReport {...dates} />);
  expect(screen.getByLabelText(/Compras y pagos/)).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Descargar Excel para contador" }));
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  expect(state.fetch.mock.calls[0][0].sections).toEqual({ sales: true, purchases: false, expenses: false });
  expect(state.fetch.mock.calls[0][0].includeTest).toBe(false);
  expect(state.success).toHaveBeenCalledTimes(1);
});
it("does not mount export action for dispatcher", () => {
  state.financial = false; render(<AccountantExportReport {...dates} />);
  expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso"); expect(state.fetch).not.toHaveBeenCalled();
});
it("cancels permanently across A→B→A even if an old response completes", async () => {
  const gate = pending<object>(); state.fetch.mockReturnValue(gate.promise);
  const { rerender } = render(<AccountantExportReport {...dates} />);
  fireEvent.click(screen.getByRole("button", { name: "Descargar Excel para contador" }));
  const signal = state.fetch.mock.calls[0][2] as AbortSignal;
  state.identity = "user:B"; state.organization = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"; rerender(<AccountantExportReport {...dates} />);
  state.identity = "user:A"; state.organization = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; rerender(<AccountantExportReport {...dates} />);
  expect(signal.aborted).toBe(true);
  await act(async () => gate.resolve({}));
  expect(state.branding).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
});
it("invalidates pending download after permission revocation or date changes", async () => {
  const gate = pending<object>(); state.branding.mockReturnValue(gate.promise);
  const { rerender } = render(<AccountantExportReport {...dates} />);
  fireEvent.click(screen.getByRole("button", { name: "Descargar Excel para contador" }));
  await waitFor(() => expect(state.branding).toHaveBeenCalled());
  state.permissions.delete("Facturas"); rerender(<AccountantExportReport {...dates} />);
  await act(async () => gate.resolve({ company: { razon_social: "B", rfc: "BBB" } }));
  expect(state.save).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
});
it("rejects reversed range and explicit cancellation", async () => {
  const { rerender } = render(<AccountantExportReport startDate={dates.endDate} endDate={dates.startDate} />);
  expect(screen.getByRole("button", { name: "Descargar Excel para contador" })).toBeDisabled();
  rerender(<AccountantExportReport {...dates} />);
  const gate = pending<object>(); state.fetch.mockReturnValue(gate.promise);
  fireEvent.click(screen.getByRole("button", { name: "Descargar Excel para contador" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar exportación" }));
  await act(async () => gate.resolve({}));
  expect(state.save).not.toHaveBeenCalled();
});
it("releases cancellation immediately and old completion cannot clear a new download", async () => {
  const oldBranding = pending<object>(); const newFetch = pending<object>();
  state.branding.mockReturnValueOnce(oldBranding.promise);
  render(<AccountantExportReport {...dates} />);
  fireEvent.click(screen.getByRole("button", { name: "Descargar Excel para contador" }));
  await waitFor(() => expect(state.branding).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar exportación" }));
  expect(screen.getByRole("button", { name: "Descargar Excel para contador" })).toBeEnabled();
  state.fetch.mockReturnValueOnce(newFetch.promise);
  fireEvent.click(screen.getByRole("button", { name: "Descargar Excel para contador" }));
  await act(async () => oldBranding.resolve({ company: { razon_social: "Old", rfc: "OLD" } }));
  expect(screen.getByRole("button", { name: "Preparando exportación…" })).toBeDisabled();
  expect(state.save).not.toHaveBeenCalled();
  await act(async () => newFetch.resolve({}));
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
});

it("downloads one shared extraction and visibly marks incomplete package without success toast", async () => {
  render(<AccountantExportReport {...dates} />);
  fireEvent.click(screen.getByLabelText(/Incluir XML\/PDF/));
  fireEvent.click(screen.getByRole("button", { name: "Descargar paquete para contador" }));
  await waitFor(() => expect(state.savePackage).toHaveBeenCalledTimes(1));
  expect(state.fetch).toHaveBeenCalledTimes(1);
  expect(state.fetch.mock.calls[0][0].includeDocuments).toBe(true);
  expect(screen.getByText(/Paquete INCOMPLETO:/)).toBeVisible();
  expect(state.success).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled();
});
it("blocks late ZIP save after identity ABA", async () => {
  const gate = pending<object>(); state.package.mockReturnValue(gate.promise);
  const { rerender } = render(<AccountantExportReport {...dates} />);
  fireEvent.click(screen.getByLabelText(/Incluir XML\/PDF/));
  fireEvent.click(screen.getByRole("button", { name: "Descargar paquete para contador" }));
  await waitFor(() => expect(state.package).toHaveBeenCalledTimes(1));
  const signal = state.package.mock.calls[0][3] as AbortSignal;
  state.identity = "user:B"; rerender(<AccountantExportReport {...dates} />);
  state.identity = "user:A"; rerender(<AccountantExportReport {...dates} />);
  expect(signal.aborted).toBe(true);
  await act(async () => gate.resolve({ incomplete: false, included: 2, missing: 0 }));
  expect(state.savePackage).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
});
