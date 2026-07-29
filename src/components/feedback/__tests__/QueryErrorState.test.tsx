import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryErrorState } from "../QueryErrorState";

describe("QueryErrorState", () => {
  it("muestra el mensaje con la entidad y el aviso de datos no confiables", () => {
    render(<QueryErrorState entity="el tablero" onRetry={() => {}} />);
    expect(screen.getByText("No se pudo cargar el tablero")).toBeInTheDocument();
    expect(screen.getByText(/no son confiables/i)).toBeInTheDocument();
  });

  it("invoca onRetry al presionar Reintentar", () => {
    const onRetry = vi.fn();
    render(<QueryErrorState entity="los reportes" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("deshabilita el botón mientras reintenta", () => {
    render(<QueryErrorState entity="los reportes" onRetry={() => {}} isRetrying />);
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeDisabled();
  });

  it("renderiza sin Card en modo bare", () => {
    const { container } = render(
      <QueryErrorState entity="el reporte" onRetry={() => {}} bare />,
    );
    expect(container.querySelector(".rounded-lg.border")).toBeNull();
    expect(screen.getByText("No se pudo cargar el reporte")).toBeInTheDocument();
  });
});
