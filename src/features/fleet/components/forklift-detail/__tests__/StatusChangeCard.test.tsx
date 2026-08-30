import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const mutate = vi.fn();
vi.mock("../../../hooks/forklifts/useForklifts", () => ({
  useUpdateStatus: () => ({ mutate, isPending: false }),
}));

import { StatusChangeCard } from "../StatusChangeCard";

function renderCard(currentStatus: string) {
  return render(
    <MemoryRouter>
      <StatusChangeCard forkliftId="f1" currentStatus={currentStatus} />
    </MemoryRouter>,
  );
}

describe("StatusChangeCard", () => {
  it("permite corregir el estado de una unidad marcada como rentada (renta ya devuelta)", async () => {
    // El backend sólo bloquea si hay renta ABIERTA (entrega sin devolución);
    // la UI no debe bloquear por el simple estado 'rented'.
    renderCard("rented");
    fireEvent.click(screen.getByRole("combobox", { name: /nuevo estado/i }));
    fireEvent.click(await screen.findByRole("option", { name: /disponible/i }));
    const button = screen.getByRole("button", { name: /actualizar estado/i });
    expect(button).toBeEnabled();
    expect(screen.queryByTestId("blocked-action-notice")).not.toBeInTheDocument();
  });

  it("exige razón para mantenimiento", async () => {
    renderCard("available");
    fireEvent.click(screen.getByRole("combobox", { name: /nuevo estado/i }));
    fireEvent.click(await screen.findByRole("option", { name: /mantenimiento/i }));
    expect(screen.getByRole("button", { name: /actualizar estado/i })).toBeDisabled();
  });
});
