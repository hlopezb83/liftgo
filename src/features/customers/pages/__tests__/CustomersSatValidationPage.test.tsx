import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import type { SatValidationRow } from "../../hooks/customers/useSatValidation";
import CustomersSatValidationPage from "../CustomersSatValidationPage";

const state = vi.hoisted(() => ({
  rows: [] as SatValidationRow[],
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock("../../hooks/customers/useSatValidation", () => ({
  SAT_VALIDATION_PAGE_SIZE: 25,
  useSatValidationOverview: (page = 1) => ({
    data: {
      rows: state.rows.slice((page - 1) * 25, page * 25),
      total: state.rows.length,
      pending: state.rows.filter((row) => row.sat_validation_status === "not_validated").length,
      mismatch: state.rows.filter((row) => row.sat_validation_status === "mismatch").length,
      error: state.rows.filter((row) => row.sat_validation_status === "error").length,
    },
    isLoading: false,
    isError: false,
  }),
  useValidateCustomersTaxInfo: () => ({ mutate: state.mutate, isPending: state.isPending }),
}));
vi.mock("@/layouts/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function makeRow(id: string, status: SatValidationRow["sat_validation_status"]): SatValidationRow {
  return {
    id, name: `Empresa ${id}`, razon_social: null, rfc: "HME080121I64",
    sat_validation_status: status, sat_validated_at: null, sat_validation_errors: [],
  };
}

function renderPage() {
  return render(<TestRouter><CustomersSatValidationPage /></TestRouter>);
}

beforeEach(() => {
  state.rows = [];
  state.isPending = false;
  state.mutate.mockClear();
});

describe("CustomersSatValidationPage", () => {
  it("deshabilita la corrida vacía y muestra el número real al seleccionar toda la cartera", async () => {
    state.rows = [makeRow("uno", "valid"), makeRow("dos", "valid"), makeRow("tres", "valid")];
    renderPage();

    expect(await screen.findByRole("button", { name: "Sólo sin validar" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Validar pendientes (0)" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Toda la cartera" }));
    expect(screen.getByRole("button", { name: "Toda la cartera" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Validar cartera (3)" }));
    expect(state.mutate).toHaveBeenCalledWith(
      { limit: 3, onlyPending: false }, expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("limita la corrida a 40 y muestra el motivo de una observación en la tarjeta móvil", async () => {
    state.rows = Array.from({ length: 41 }, (_, i) => makeRow(String(i), "not_validated"));
    state.rows[0] = makeRow("observado", "mismatch");
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Validar pendientes (40)" }));
    expect(state.mutate).toHaveBeenCalledWith(
      { limit: 40, onlyPending: true }, expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    const mobileResult = screen.getByRole("article", { name: "Cliente Empresa observado" });
    expect(within(mobileResult).getByText("Última validación")).toBeInTheDocument();
    expect(within(mobileResult).getByText("Sin detalle del SAT. Vuelve a validar para obtener el motivo.")).toBeInTheDocument();
  });

  it("mantiene métricas y validación de toda la cartera al paginar los resultados", async () => {
    state.rows = Array.from({ length: 1100 }, (_, i) =>
      makeRow(String(i), i === 1099 ? "not_validated" : "valid"),
    );
    renderPage();

    expect(await screen.findByText("1,100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validar pendientes (1)" })).toBeEnabled();
    expect(screen.getByText("Mostrando 1–25 de 1,100 clientes")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(25);

    fireEvent.click(screen.getByRole("button", { name: "44" }));
    expect(screen.getByText("Mostrando 1,076–1,100 de 1,100 clientes")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Cliente Empresa 1099" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validar pendientes (1)" })).toBeEnabled();
  });
});
