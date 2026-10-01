import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeliverySignatureDialog } from "../DeliverySignatureDialog";

vi.mock("@/features/contracts", () => ({ SignaturePad: () => <div>Firma</div> }));
const base = {
  open: true, onOpenChange: vi.fn(), hoursReading: "1251",
  onHoursReadingChange: vi.fn(), onComplete: vi.fn(), minHours: 1250,
};

describe("Confirmación del tipo de transporte", () => {
  it("la recolección conserva su tipo en firma, evidencia y lectura previa", () => {
    render(<DeliverySignatureDialog {...base} transportType="pickup" />);
    expect(screen.getByText("Solicite la firma del cliente para confirmar la recolección.")).toBeInTheDocument();
    expect(screen.getByText("Lectura de entrega: 1250 h. La recolección no puede ser menor.")).toBeInTheDocument();
  });
  it("la entrega no describe una recolección", () => {
    render(<DeliverySignatureDialog {...base} transportType="delivery" />);
    expect(screen.getByText("Solicite la firma del cliente para confirmar la entrega.")).toBeInTheDocument();
    expect(screen.getByText("Última lectura: 1250 h. La lectura actual no puede ser menor.")).toBeInTheDocument();
    expect(screen.queryByText(/recolección/)).not.toBeInTheDocument();
  });
});
