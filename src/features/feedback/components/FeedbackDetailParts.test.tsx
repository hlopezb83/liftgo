import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeedbackHistoryList } from "./FeedbackDetailParts";

describe("FeedbackHistoryList", () => {
  it("distingue un error de red de un historial realmente vacío y permite reintentar", () => {
    const onRetry = vi.fn();
    render(
      <FeedbackHistoryList
        history={undefined}
        isError
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("No se pudo cargar el historial del reporte")).toBeInTheDocument();
    expect(screen.queryByText("Sin cambios todavía.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("muestra el estado vacío sólo después de una respuesta exitosa", () => {
    render(<FeedbackHistoryList history={[]} />);
    expect(screen.getByText("Sin cambios todavía.")).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo cargar/)).not.toBeInTheDocument();
  });
});

