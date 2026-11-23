import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { useUserManualMock } = vi.hoisted(() => ({
  useUserManualMock: vi.fn(),
}));

vi.mock("../hooks/useUserManual", () => ({
  useUserManual: useUserManualMock,
}));

vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: "customer" }),
}));

import HelpPage from "./HelpPage";

describe("HelpPage version feedback", () => {
  it("muestra el error de versiones y expone un reintento", () => {
    const refetchVersions = vi.fn();
    useUserManualMock.mockReturnValue({
      manual: {
        id: "manual-1",
        version: "2.0",
        generated_at: "2026-09-09T12:00:00Z",
        content: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      generate: vi.fn(),
      isGenerating: false,
      versions: [],
      versionsIsLoading: false,
      versionsIsError: true,
      refetchVersions,
      selectedVersion: null,
      setSelectedVersion: vi.fn(),
    });

    render(<HelpPage />);

    expect(screen.getByText("No se pudo cargar las versiones del manual")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/i }));
    expect(refetchVersions).toHaveBeenCalledTimes(1);
  });
});


it("conserva la sección abierta cuando cambia de posición o queda fuera de la búsqueda", () => {
  useUserManualMock.mockReturnValue({
    manual: {
      id: "manual-1", version: "2.0", generated_at: "2026-11-01",
      content: [{ title: "Entregas", content: "Registrar una entrega" }, { title: "Cobranza", content: "Registrar un pago" }],
    },
    isLoading: false, isError: false, isGenerating: false, versions: [],
  });
  render(<HelpPage />);
  const search = screen.getByRole("textbox", { name: "Buscar en el manual" });
  fireEvent.click(screen.getByRole("button", { name: "Cobranza" }));
  fireEvent.change(search, { target: { value: "pago" } });
  expect(screen.getByRole("button", { name: "Cobranza" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.change(search, { target: { value: "sin resultados" } });
  expect(screen.queryByRole("button", { name: "Cobranza" })).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "" } });
  expect(screen.getByRole("button", { name: "Cobranza" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Entregas" })).toHaveAttribute("aria-expanded", "false");
});
