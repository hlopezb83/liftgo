import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawSignature, mockSignatureCanvas } from "@/test/signatureCanvas";
import { SignaturePad } from "../SignaturePad";

let browser: ReturnType<typeof mockSignatureCanvas>;
beforeEach(() => { browser = mockSignatureCanvas(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = (name: string) => screen.getByRole("button", { name });
function setup(disabled = false) {
  const onSave = vi.fn();
  const onClear = vi.fn();
  const view = render(<SignaturePad onSave={onSave} onClear={onClear} disabled={disabled} />);
  const canvas = screen.getByLabelText<HTMLCanvasElement>("Firma del cliente");
  return { ...view, canvas, onSave, onClear };
}

describe("SignaturePad with the real signature_pad engine", () => {
  it("blocks empty save, exports PNG and preserves onSave/onClear", () => {
    const { canvas, onSave, onClear } = setup();
    expect(button("Confirmar Firma")).toBeDisabled();
    expect(button("Deshacer")).toBeDisabled();
    drawSignature(canvas);
    fireEvent.click(button("Confirmar Firma"));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("data:image/png;base64,c2ln");
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/png", undefined);
    fireEvent.click(button("Limpiar"));
    expect(onClear).toHaveBeenCalledOnce();
    expect(button("Confirmar Firma")).toBeDisabled();
    drawSignature(canvas);
    expect(button("Confirmar Firma")).toBeEnabled();
  });

  it.each(["mouse", "touch", "pen"])("supports %s pointers and undo to empty", (type) => {
    const { canvas } = setup();
    drawSignature(canvas, type);
    drawSignature(canvas, type, 2);
    fireEvent.click(button("Deshacer"));
    expect(button("Confirmar Firma")).toBeEnabled();
    fireEvent.click(button("Deshacer"));
    expect(button("Confirmar Firma")).toBeDisabled();
  });

  it("preserves strokes and undo across resize, DPR and hidden dialogs", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { canvas } = setup();
    expect([canvas.width, canvas.height]).toEqual([800, 400]);
    expect(browser.ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    drawSignature(canvas);
    act(() => browser.resize(0, 0));
    expect(canvas.width).toBe(800);
    act(() => browser.resize(200, 100));
    expect([canvas.width, canvas.height]).toEqual([400, 200]);
    expect(button("Confirmar Firma")).toBeEnabled();
    vi.stubGlobal("devicePixelRatio", 3);
    fireEvent(window, new Event("resize"));
    expect([canvas.width, canvas.height]).toEqual([600, 300]);
    fireEvent.click(button("Deshacer"));
    expect(button("Confirmar Firma")).toBeDisabled();
  });

  it("blocks initially disabled input and recovers after an interrupted stroke", () => {
    const { canvas, rerender, onSave } = setup(true);
    drawSignature(canvas);
    expect(browser.ctx.arc).not.toHaveBeenCalled();
    rerender(<SignaturePad onSave={onSave} />);
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1, buttons: 1 });
    rerender(<SignaturePad onSave={onSave} disabled />);
    const calls = browser.ctx.arc.mock.calls.length;
    fireEvent.pointerMove(window, { clientX: 40, clientY: 30, pointerId: 1, buttons: 1 });
    expect(browser.ctx.arc).toHaveBeenCalledTimes(calls);
    for (const name of ["Deshacer", "Limpiar", "Confirmar Firma"]) expect(button(name)).toBeDisabled();
    rerender(<SignaturePad onSave={onSave} />);
    drawSignature(canvas, "pen", 2);
    fireEvent.click(button("Deshacer"));
    expect(button("Confirmar Firma")).toBeEnabled();
    fireEvent.click(button("Deshacer"));
    expect(button("Confirmar Firma")).toBeDisabled();
  });

  it("ends canceled strokes, permits subsequent pointers and cleans listeners on unmount", () => {
    const { canvas, unmount } = setup();
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1, buttons: 1 });
    fireEvent.pointerCancel(window, { clientX: 10, clientY: 10, pointerId: 1 });
    drawSignature(canvas, "touch", 2);
    fireEvent.click(button("Deshacer"));
    expect(button("Confirmar Firma")).toBeEnabled();
    unmount();
    const calls = browser.ctx.arc.mock.calls.length;
    drawSignature(canvas);
    expect(browser.ctx.arc).toHaveBeenCalledTimes(calls);
    expect(browser.disconnect).toHaveBeenCalledOnce();
  });

  it.each(["Limpiar", "Deshacer"])("%s resets an interrupted pointer before the next stroke", (action) => {
    const { canvas } = setup();
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1, buttons: 1 });
    fireEvent.click(button(action));
    expect(button("Confirmar Firma")).toBeDisabled();
    drawSignature(canvas, "pen", 2);
    expect(button("Confirmar Firma")).toBeEnabled();
    fireEvent.click(button("Deshacer"));
    expect(button("Confirmar Firma")).toBeDisabled();
  });

  it("remounts safely in StrictMode", () => {
    render(<StrictMode><SignaturePad onSave={vi.fn()} /></StrictMode>);
    drawSignature(screen.getByLabelText<HTMLCanvasElement>("Firma del cliente"));
    fireEvent.click(button("Deshacer"));
    expect(button("Confirmar Firma")).toBeDisabled();
  });
});
