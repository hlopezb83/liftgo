import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { WorkOrderCloseSummary } from "../WorkOrderCloseSummary";

type Part = { quantity_used: number; cost_at_time: number };
type Labor = { hours: number; total_cost: number };
const reads = vi.hoisted(() => ({
  parts: vi.fn<() => Promise<Part[]>>(),
  labor: vi.fn<() => Promise<Labor[]>>(),
}));

// Use real QueryObservers so a failed refetch keeps cached data, as in the app.
// Only the data reads are replaced; no backend or transport is contacted.
vi.mock("@/features/inventory", () => ({
  useMaintenanceParts: (id: string) => useQuery({
    queryKey: ["summary-parts", id], queryFn: reads.parts, staleTime: Infinity,
  }),
}));
vi.mock("../../../hooks/maintenance/useMaintenanceLabor", () => ({
  useMaintenanceLabor: (id: string) => useQuery({
    queryKey: ["summary-labor", id], queryFn: reads.labor, staleTime: Infinity,
  }),
}));

const parts: Part[] = [{ quantity_used: 2, cost_at_time: 100 }];
const labor: Labor[] = [{ hours: 1, total_cost: 50 }];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderSummary(storedCost = 350, manualCost = 100) {
  const { Wrapper, queryClient } = createQueryWrapper();
  render(<WorkOrderCloseSummary maintenanceLogId="ot-a" storedCost={storedCost} manualCost={manualCost} />, { wrapper: Wrapper });
  return queryClient;
}

function expectStoredTotal() {
  expect(screen.getByText("Último total registrado").parentElement).toHaveTextContent(formatCurrency(350));
  expect(screen.queryByText("Costo total")).not.toBeInTheDocument();
  expect(screen.queryByText(/^Refacciones \(/)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Mano de obra \(/)).not.toBeInTheDocument();
  expect(screen.queryByText("Costo manual")).not.toBeInTheDocument();
  expect(screen.queryByText("Otros costos")).not.toBeInTheDocument();
}

beforeEach(() => {
  vi.resetAllMocks();
  reads.parts.mockResolvedValue(parts);
  reads.labor.mockResolvedValue(labor);
});

describe("WorkOrderCloseSummary — complete reads before showing a breakdown", () => {
  it("keeps the stored total while both reads load and while only one has finished", async () => {
    const pendingParts = deferred<Part[]>();
    const pendingLabor = deferred<Labor[]>();
    reads.parts.mockReturnValueOnce(pendingParts.promise);
    reads.labor.mockReturnValueOnce(pendingLabor.promise);
    renderSummary();

    expect(screen.getByRole("status")).toHaveTextContent("Cargando desglose…");
    expectStoredTotal();
    await act(async () => { pendingParts.resolve(parts); });
    expectStoredTotal();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => { pendingLabor.resolve(labor); });
    expect(await screen.findByText("Costo total")).toBeInTheDocument();
    expect(screen.getByText("Costo total").parentElement).toHaveTextContent(formatCurrency(350));
    expect(screen.getByText("Refacciones (1)").parentElement).toHaveTextContent(formatCurrency(200));
    expect(screen.getByText("Mano de obra (1 h)").parentElement).toHaveTextContent(formatCurrency(50));
    expect(screen.getByText("Costo manual").parentElement).toHaveTextContent(formatCurrency(100));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Último total registrado")).not.toBeInTheDocument();
  });

  it.each(["parts", "labor"] as const)("recovers both reads after %s fails without showing a partial total", async (failedRead) => {
    reads[failedRead].mockRejectedValueOnce(new Error("Read unavailable"));
    renderSummary();

    expect(await screen.findByText("No se pudo cargar el desglose del servicio")).toBeInTheDocument();
    expectStoredTotal();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Costo total")).toBeInTheDocument();
    expect(reads.parts).toHaveBeenCalledTimes(2);
    expect(reads.labor).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Costo total").parentElement).toHaveTextContent(formatCurrency(350));
    expect(screen.queryByText("No se pudo cargar el desglose del servicio")).not.toBeInTheDocument();
  });

  it("hides cached values during refetch and after failure until both retry reads recover", async () => {
    const client = renderSummary(350, 0);
    await screen.findByText("Costo total");
    const failedRefetch = deferred<Labor[]>();
    reads.labor.mockReturnValueOnce(failedRefetch.promise);
    act(() => { void client.refetchQueries(); });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Cargando desglose…"));
    expectStoredTotal();

    await act(async () => { failedRefetch.reject(new Error("Refresh failed")); });
    await screen.findByText("No se pudo cargar el desglose del servicio");
    expect(client.getQueryData(["summary-labor", "ot-a"])).toEqual(labor);
    expectStoredTotal();

    const retriedParts = deferred<Part[]>();
    const retriedLabor = deferred<Labor[]>();
    reads.parts.mockReturnValueOnce(retriedParts.promise);
    reads.labor.mockReturnValueOnce(retriedLabor.promise);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar" })).toBeDisabled());
    expectStoredTotal();
    await act(async () => { retriedLabor.resolve(labor); });
    expectStoredTotal();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando desglose…");
    await act(async () => { retriedParts.resolve(parts); });

    await screen.findByText("Costo total");
    expect(reads.parts).toHaveBeenCalledTimes(3);
    expect(reads.labor).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Otros costos").parentElement).toHaveTextContent(formatCurrency(100));
    expect(screen.getByText("Costo total").parentElement).toHaveTextContent(formatCurrency(350));
    expect(screen.queryByText("Último total registrado")).not.toBeInTheDocument();
  });

  it("shows legitimate zero counts and amounts only after successful empty reads", async () => {
    reads.parts.mockResolvedValue([]);
    reads.labor.mockResolvedValue([]);
    renderSummary(0, 0);

    await screen.findByText("Costo total");
    expect(screen.getByText("Refacciones (0)").parentElement).toHaveTextContent(formatCurrency(0));
    expect(screen.getByText("Mano de obra (0 h)").parentElement).toHaveTextContent(formatCurrency(0));
    expect(screen.getByText("Otros costos").parentElement).toHaveTextContent(formatCurrency(0));
    expect(screen.getByText("Costo total").parentElement).toHaveTextContent(formatCurrency(0));
    expect(screen.queryByText("Último total registrado")).not.toBeInTheDocument();
  });
});
