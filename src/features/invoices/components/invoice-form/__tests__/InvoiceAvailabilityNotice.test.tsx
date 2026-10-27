import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvoiceAvailabilityNotice } from "../InvoiceAvailabilityNotice";

describe("InvoiceAvailabilityNotice", () => {
  it.each([false, true])("no muestra aviso ni reintento sin bloqueos (cargando: %s)", (isLoading) => {
    const { container } = render(<InvoiceAvailabilityNotice chargeBlock={null} bookingAvailabilityBlock={null} isLoading={isLoading} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["Cargos reservados", null, "Cargos reservados"],
    [null, "Reserva no disponible", "Reserva no disponible"],
    ["Cargos reservados", "Reserva no disponible", "Cargos reservados"],
  ])("conserva la prioridad del bloqueo de cargos sobre el de reservas", (chargeBlock, bookingAvailabilityBlock, expected) => {
    render(<InvoiceAvailabilityNotice chargeBlock={chargeBlock} bookingAvailabilityBlock={bookingAvailabilityBlock} isLoading={false} onRetry={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert.firstElementChild).toHaveTextContent(expected!);
    expect(alert).toHaveTextContent("Los borradores también reservan cargos. Si hay partidas históricas sin vínculo, concílialas antes de continuar.");
    if (chargeBlock && bookingAvailabilityBlock) expect(alert).not.toHaveTextContent(bookingAvailabilityBlock);
  });

  it("reintenta una vez sin enviar el formulario y se deshabilita durante la consulta", () => {
    const onRetry = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const notice = (isLoading: boolean) => (
      <form onSubmit={onSubmit}>
        <InvoiceAvailabilityNotice chargeBlock="Cargos reservados" bookingAvailabilityBlock={null} isLoading={isLoading} onRetry={onRetry} />
      </form>
    );
    const { rerender } = render(notice(false));
    const retry = screen.getByRole("button", { name: "Reintentar consulta" });
    expect(retry).toHaveAttribute("type", "button");
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(notice(true));
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
