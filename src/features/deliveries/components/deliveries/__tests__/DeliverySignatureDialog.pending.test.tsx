import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeliverySignatureDialog } from "../DeliverySignatureDialog";

vi.mock("@/features/contracts", () => import("@/features/contracts/components/contracts/SignaturePad"));

const ctx = {
  fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
  lineTo: vi.fn(), stroke: vi.fn(), getImageData: vi.fn(() => ({})), putImageData: vi.fn(),
};
const originalCapture = HTMLCanvasElement.prototype.setPointerCapture;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,c2ln");
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  if (originalCapture) HTMLCanvasElement.prototype.setPointerCapture = originalCapture;
  else Reflect.deleteProperty(HTMLCanvasElement.prototype, "setPointerCapture");
});

function setup() {
  const props = {
    open: true, isPending: false, hoursReading: "",
    onOpenChange: vi.fn(), onHoursReadingChange: vi.fn(), onComplete: vi.fn(),
    operatorName: "Diego Salinas",
  };
  return { ...render(<DeliverySignatureDialog {...props} />), props };
}

describe("DeliverySignatureDialog durante el guardado", () => {
  it("bloquea cierre, omisión y horómetro durante la mutación", () => {
    const { props, rerender } = setup();
    rerender(<DeliverySignatureDialog {...props} isPending />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Omitir Firma" }));
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("spinbutton", { name: "Lectura de Horómetro (horas)" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Guardando transporte…");
  });

  it("deshabilita una firma ya dibujada y las herramientas mientras guarda", () => {
    const { props, rerender, container } = setup();
    const canvas = container.ownerDocument.querySelector("canvas");
    if (!canvas) throw new Error("Lienzo ausente");
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(screen.getByRole("button", { name: "Confirmar Firma" })).toBeEnabled();
    rerender(<DeliverySignatureDialog {...props} isPending />);
    for (const name of ["Confirmar Firma", "Limpiar", "Deshacer"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(props.onComplete).not.toHaveBeenCalled();
    rerender(<DeliverySignatureDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar Firma" }));
    expect(props.onComplete).toHaveBeenCalledWith("data:image/png;base64,c2ln");
  });

  it("protege también la justificación al completar sin evidencia", () => {
    const { props, rerender } = setup();
    rerender(<DeliverySignatureDialog {...props} operatorName={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Omitir Firma" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Justificación" }), { target: { value: "Autorización registrada" } });
    rerender(<DeliverySignatureDialog {...props} operatorName={null} isPending />);
    expect(screen.getByRole("textbox", { name: "Justificación" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Volver" })).toBeDisabled();
    const complete = screen.getByRole("button", { name: "Completar sin evidencia" });
    expect(complete).toBeDisabled();
    fireEvent.click(complete);
    expect(props.onComplete).not.toHaveBeenCalled();
  });
});
