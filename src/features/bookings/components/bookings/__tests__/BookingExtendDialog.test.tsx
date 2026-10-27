import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BookingExtensionPreview } from "../../../hooks/bookingActions/useExtendBookingPreview";
import { BookingExtendDialog } from "../BookingActionDialogs";

const preview: BookingExtensionPreview = {
  items: [{ description: "Equipo ficticio de nombre largo - Extensión semanal", quantity: 1, unit_price: 4500, total: 4500, rate_type: "weekly", clave_unidad: "WEE" }],
  range: { start: "2026-11-01", end: "2026-11-07", days: 7 },
  subtotal: 4500, taxAmount: 720, total: 5220, taxRate: 16, currency: "MXN", rateSource: "booking",
};

function Harness({ estimate = preview, pending = false, recurringBilling = false, initialDate = new Date("2026-11-07T12:00:00"), onExtend = vi.fn() }: {
  estimate?: BookingExtensionPreview | null;
  pending?: boolean;
  recurringBilling?: boolean;
  initialDate?: Date;
  onExtend?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [date, setDate] = useState<Date | undefined>(initialDate);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={triggerRef} onClick={() => setOpen(true)}>Abrir extensión</button>
    <BookingExtendDialog
      open={open} onOpenChange={setOpen} currentEndDate="2026-10-31"
      newEndDate={date} setNewEndDate={setDate} extendPreview={estimate}
      isPending={pending} onExtend={onExtend}
      recurringBilling={recurringBilling}
      onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}
    />
  </>;
}

describe("BookingExtendDialog", () => {
  it.each(["MXN", "USD"])("explica comparación, días, tarifa, IVA y estimación en %s", (currency) => {
    render(<Harness estimate={{ ...preview, currency }} />);
    const dialog = screen.getByRole("dialog", { name: "Extender Reserva" });
    expect(dialog).toHaveTextContent("Fin actual31/10/2026");
    expect(dialog).toHaveTextContent("Nuevo fin07/11/2026");
    expect(dialog).toHaveTextContent("7 días adicionales");
    expect(dialog).toHaveTextContent("Del 01/11/2026 al 07/11/2026, ambos incluidos.");
    const estimate = within(dialog).getByRole("region", { name: "Desglose estimado de la extensión" });
    expect(estimate).toHaveTextContent("Cálculo con tarifas pactadas");
    expect(estimate).toHaveTextContent("1 semana");
    expect(estimate).toHaveTextContent(/Tarifa aplicada:.*4,500\.00/);
    expect(estimate).toHaveTextContent(/Subtotal.*4,500\.00/);
    expect(estimate).toHaveTextContent(/IVA \(16%\).*720\.00/);
    expect(estimate).toHaveTextContent(/Total adicional estimado.*5,220\.00/);
    expect(estimate).toHaveTextContent(currency);
    // Exactly one explicit code for each of the five displayed monetary values.
    expect(estimate.textContent?.match(new RegExp(currency, "g"))).toHaveLength(5);
    expect(estimate).toHaveTextContent("Esta estimación no es una factura emitida.");
  });

  it("distingue el catálogo y conserva el prorrateo como servicio sin inventar meses completos", () => {
    render(<Harness estimate={{ ...preview, rateSource: "catalog", items: [{ ...preview.items[0], rate_type: "monthly", clave_unidad: "E48" }] }} />);
    expect(screen.getByText("Cálculo con tarifas del catálogo")).toBeInTheDocument();
    expect(screen.getByText("1 servicio (prorrateo mensual)")).toBeInTheDocument();
  });

  it("explica que los días de una reserva recurrente se incluyen en el borrador mensual", () => {
    render(<Harness recurringBilling />);
    expect(screen.getByText("Los días adicionales de esta reserva se incluyen al generar el borrador del periodo mensual correspondiente.")).toBeInTheDocument();
    expect(screen.getByText("Total estimado del tramo adicional")).toBeInTheDocument();
    expect(screen.queryByText("Total adicional estimado")).toBeNull();
    expect(screen.getByRole("button", { name: "Extender" })).toBeEnabled();
  });

  it("una fecha inválida no muestra días NaN ni permite confirmar", () => {
    render(<Harness initialDate={new Date(Number.NaN)} estimate={null} />);
    expect(screen.getByText("Selecciona una fecha válida.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extender" })).toBeDisabled();
    expect(screen.getByRole("dialog")).not.toHaveTextContent("NaN");
    expect(screen.queryByText(/días adicionales/)).toBeNull();
  });

  it.each(["Cancelar", "Cerrar"])("%s cierra sin extender y devuelve foco", async (name) => {
    const onExtend = vi.fn();
    render(<Harness onExtend={onExtend} />);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir extensión" })).toHaveFocus());
    expect(onExtend).not.toHaveBeenCalled();
  });

  it("Escape cierra sin extender y devuelve foco", async () => {
    const onExtend = vi.fn();
    render(<Harness onExtend={onExtend} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir extensión" })).toHaveFocus());
    expect(onExtend).not.toHaveBeenCalled();
  });

  it("bloquea fecha, confirmar, cancelar y Escape durante la mutación", () => {
    const onExtend = vi.fn();
    render(<Harness pending onExtend={onExtend} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Nueva Fecha de Fin" })).toBeDisabled();
    for (const name of ["Extender", "Cancelar"]) {
      const button = within(dialog).getByRole("button", { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onExtend).not.toHaveBeenCalled();
  });

  it.each(["2026-10-31", "2026-10-30"])("rechaza la fecha %s que no amplía la reserva", (date) => {
    render(<Harness initialDate={new Date(`${date}T12:00:00`)} estimate={null} />);
    expect(screen.getByText("La nueva fecha debe ser posterior al fin actual.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extender" })).toBeDisabled();
  });

  it("una captura parcial invalida el fin anterior y evita enviar una fecha obsoleta", () => {
    const onExtend = vi.fn();
    render(<Harness onExtend={onExtend} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Nueva Fecha de Fin" }), { target: { value: "08/11/20" } });
    const submit = screen.getByRole("button", { name: "Extender" });
    expect(submit).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Desglose estimado de la extensión" })).toBeNull();
    fireEvent.click(submit);
    expect(onExtend).not.toHaveBeenCalled();
  });

  it("una fecha válida conserva la acción aunque no haya tarifas para estimar", () => {
    const onExtend = vi.fn();
    render(<Harness estimate={null} onExtend={onExtend} />);
    expect(screen.getByText("No hay una estimación disponible para este periodo.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Extender" }));
    expect(onExtend).toHaveBeenCalledOnce();
  });
});
