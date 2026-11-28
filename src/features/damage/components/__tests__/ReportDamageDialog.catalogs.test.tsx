import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReportDamageDialog } from "../ReportDamageDialog";

const mocks = vi.hoisted(() => ({ forklifts: vi.fn(), customers: vi.fn(), retryForklifts: vi.fn(), retryCustomers: vi.fn(), save: vi.fn(), upload: vi.fn() }));
vi.mock("@/features/fleet", () => ({ useForklifts: mocks.forklifts }));
vi.mock("@/features/customers", () => ({ useCustomers: mocks.customers }));
vi.mock("../../hooks/useDamageRecords", () => ({ useSaveManualDamageReport: () => ({ mutateAsync: mocks.save, isPending: false }) }));
vi.mock("@/hooks/useDocuments", () => ({ useUploadDocument: () => ({ mutateAsync: mocks.upload, isPending: false }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn() }));

const fleet = [{ id: "forklift-1", manufacturer: "Toyota", model: "QA", name: "Equipo QA" }];
const clients = [{ id: "customer-1", name: "Cliente QA", company: "Cliente QA" }];
const ready = (data: unknown[], refetch: () => unknown) => ({ data, refetch, isLoading: false, isError: false, isSuccess: true, isFetching: false, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.forklifts.mockReturnValue(ready(fleet, mocks.retryForklifts));
  mocks.customers.mockReturnValue(ready(clients, mocks.retryCustomers));
  mocks.save.mockResolvedValue({ id: "damage-1", updated_at: "2026-11-14T00:00:00Z" });
  mocks.upload.mockResolvedValue({ id: "photo-1" });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); });

async function choose(label: string, option: RegExp) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

it.each(["forklifts", "customers"] as const)("recovers %s independently without losing selected fields or photos", async (failedCatalog) => {
  const view = render(<ReportDamageDialog open />);
  await choose("Montacargas", /Equipo QA/);
  await choose("Cliente (opcional)", /Cliente QA/);
  fireEvent.change(screen.getByLabelText(/Descripción del daño/), { target: { value: "Captura conservada" } });
  const photo = new File(["photo"], "damage.png", { type: "image/png" });
  await act(async () => { fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [photo] } }); });
  expect(await screen.findByAltText("Vista previa 1")).toBeInTheDocument();
  const failed = failedCatalog === "forklifts" ? mocks.forklifts : mocks.customers;
  const retry = failedCatalog === "forklifts" ? mocks.retryForklifts : mocks.retryCustomers;
  const data = failedCatalog === "forklifts" ? fleet : clients;
  failed.mockReturnValue({ ...ready(data, retry), isError: true, isSuccess: false, error: new Error("Synthetic failure") });
  view.rerender(<ReportDamageDialog open />);
  expect(screen.getByRole("combobox", { name: failedCatalog === "forklifts" ? "Montacargas" : "Cliente (opcional)" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: failedCatalog === "forklifts" ? "Cliente (opcional)" : "Montacargas" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(mocks.save).not.toHaveBeenCalled();
  failed.mockReturnValue(ready(data, retry));
  view.rerender(<ReportDamageDialog open />);
  expect(screen.getByLabelText(/Descripción del daño/)).toHaveValue("Captura conservada");
  expect(screen.getByAltText("Vista previa 1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reportar (1 foto)" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ forkliftId: "forklift-1", customerId: "customer-1", description: "Captura conservada" })));
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ file: photo })));
});

it("distinguishes loading and real empty catalogs, and cannot submit without a forklift", async () => {
  mocks.forklifts.mockReturnValue({ ...ready([], mocks.retryForklifts), data: undefined, isLoading: true, isSuccess: false });
  mocks.customers.mockReturnValue({ ...ready([], mocks.retryCustomers), data: undefined, isLoading: true, isSuccess: false });
  const view = render(<ReportDamageDialog open />);
  expect(screen.getByText("Cargando los montacargas…")).toBeInTheDocument();
  expect(screen.getByText("Cargando los clientes…")).toBeInTheDocument();
  expect(screen.queryByText(/No hay montacargas disponibles/)).not.toBeInTheDocument();
  mocks.forklifts.mockReturnValue(ready([], mocks.retryForklifts));
  mocks.customers.mockReturnValue(ready([], mocks.retryCustomers));
  view.rerender(<ReportDamageDialog open />);
  expect(screen.getByText(/No hay montacargas disponibles/)).toBeInTheDocument();
  expect(screen.getByText(/No hay clientes disponibles/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Descripción del daño/), { target: { value: "Falta equipo" } });
  fireEvent.click(screen.getByRole("button", { name: "Reportar" }));
  expect(await screen.findByText("Selecciona un montacargas")).toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("allows clearing an optional customer without sending the select sentinel", async () => {
  render(<ReportDamageDialog open />);
  await choose("Montacargas", /Equipo QA/);
  await choose("Cliente (opcional)", /Cliente QA/);
  await choose("Cliente (opcional)", /^Sin cliente$/);
  fireEvent.change(screen.getByLabelText(/Descripción del daño/), { target: { value: "Sin cliente" } });
  fireEvent.click(screen.getByRole("button", { name: "Reportar" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ customerId: "" })));
});
