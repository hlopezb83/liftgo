import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "../ErrorState";

describe("ErrorState", () => {
  it("renderiza título por defecto y no muestra botón sin onRetry", () => {
    render(<ErrorState />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/No pudimos cargar los datos/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("dispara onRetry al hacer click en el botón Reintentar", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("acepta título, subtítulo y label personalizados", () => {
    render(
      <ErrorState
        title="Error de red"
        subtitle="Verifica tu conexión"
        retryLabel="Volver a intentar"
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByText("Error de red")).toBeInTheDocument();
    expect(screen.getByText("Verifica tu conexión")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver a intentar" })).toBeInTheDocument();
  });
});
