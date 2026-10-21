import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ForkliftSelector } from "../ForkliftSelector";

const props = { value: "", onValueChange: vi.fn(), availableForklifts: [], datesSelected: true };

describe("ForkliftSelector availability states", () => {
  it.each(["isLoading", "isFetching"])("does not report an empty fleet while %s", (state) => {
    render(<ForkliftSelector {...props} {...{ [state]: true }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Verificando disponibilidad");
    expect(screen.queryByText(/No hay montacargas/)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
  it("shows a retryable error, not a false empty result", () => {
    const retry = vi.fn();
    render(<ForkliftSelector {...props} isError onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo consultar");
    expect(screen.queryByText(/No hay montacargas/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar disponibilidad" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("reports an empty result only after a successful check", () => {
    render(<ForkliftSelector {...props} />);
    expect(screen.getByText(/No hay montacargas disponibles/)).toBeInTheDocument();
  });
});
