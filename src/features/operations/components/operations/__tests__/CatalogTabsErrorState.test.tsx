import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DriversTab } from "../DriversTab";
import { EquipmentModelsTab } from "../EquipmentModelsTab";
import { MaintenancePoliciesTab } from "../MaintenancePoliciesTab";
import { MechanicsTab } from "../MechanicsTab";

/**
 * Ronda 4 (FE4-01): en viewport móvil, las pestañas de catálogos deben mostrar
 * QueryErrorState cuando su query principal falla, en lugar de la lista vacía
 * de MobileCardList (que sugeriría "no hay registros" cuando en realidad el
 * fetch nunca llegó a responder).
 */

const useDriversMock = vi.fn();
const useMechanicsMock = vi.fn();
const useEquipmentModelsMock = vi.fn();
const useMaintenancePoliciesMock = vi.fn();
const useForkliftsMock = vi.fn();

function idleMutation() {
  return { mutate: vi.fn(), isPending: false };
}

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
}));

vi.mock("@/features/fleet", () => ({
  useDrivers: () => useDriversMock(),
  useCreateDriver: idleMutation,
  useUpdateDriver: idleMutation,
  useDeleteDriver: idleMutation,
  useEquipmentModels: () => useEquipmentModelsMock(),
  useCreateEquipmentModel: idleMutation,
  useUpdateEquipmentModel: idleMutation,
  useDeleteEquipmentModel: idleMutation,
  useForklifts: () => useForkliftsMock(),
}));

vi.mock("@/features/maintenance", () => ({
  useMechanics: () => useMechanicsMock(),
  useCreateMechanic: idleMutation,
  useUpdateMechanic: idleMutation,
  useDeleteMechanic: idleMutation,
  useMaintenancePolicies: () => useMaintenancePoliciesMock(),
  useCreateMaintenancePolicy: idleMutation,
  useUpdateMaintenancePolicy: idleMutation,
  useDeleteMaintenancePolicy: idleMutation,
}));

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithProviders(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>,
  );
}

const errorQueryResult = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
const idleQueryResult = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };

beforeEach(() => {
  useDriversMock.mockReset();
  useMechanicsMock.mockReset();
  useEquipmentModelsMock.mockReset();
  useMaintenancePoliciesMock.mockReset();
  useForkliftsMock.mockReset();
  useForkliftsMock.mockReturnValue(idleQueryResult);
});

const cases: Array<{
  name: string;
  Component: () => React.JSX.Element;
  mock: ReturnType<typeof vi.fn>;
  emptyMessage: string;
}> = [
  { name: "DriversTab", Component: DriversTab, mock: useDriversMock, emptyMessage: "No hay operadores registrados" },
  { name: "MechanicsTab", Component: MechanicsTab, mock: useMechanicsMock, emptyMessage: "No hay mecánicos registrados" },
  { name: "EquipmentModelsTab", Component: EquipmentModelsTab, mock: useEquipmentModelsMock, emptyMessage: "No hay modelos de equipo configurados" },
  { name: "MaintenancePoliciesTab", Component: MaintenancePoliciesTab, mock: useMaintenancePoliciesMock, emptyMessage: "No hay pólizas de mantenimiento configuradas" },
];

describe.each(cases)("$name en móvil (FE4-01)", ({ Component, mock, emptyMessage }) => {
  it("muestra QueryErrorState con botón de reintentar cuando la query falla, no la lista vacía", () => {
    mock.mockReturnValue(errorQueryResult);

    renderWithProviders(<Component />);

    expect(screen.getByText(/No se pudo cargar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument();
  });
});
