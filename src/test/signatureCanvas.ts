import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

/** Mock only browser rasterization/layout; tests execute the actual signature_pad engine. */
export function mockSignatureCanvas() {
  const ctx = {
    fillRect: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(),
  };
  let size = { width: 400, height: 200 };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,c2ln");
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    ...size, x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height, toJSON: () => ({}),
  }));
  let resize: ResizeObserverCallback | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  return {
    ctx, disconnect,
    resize(width: number, height: number) {
      size = { width, height };
      resize?.([], {} as ResizeObserver);
    },
  };
}

export function drawSignature(canvas: HTMLCanvasElement, pointerType = "pen", pointerId = 1) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId, pointerType, buttons: 1, pressure: 0.5 });
  fireEvent.pointerMove(window, { clientX: 40, clientY: 30, pointerId, pointerType, buttons: 1, pressure: 0.5 });
  fireEvent.pointerUp(window, { clientX: 70, clientY: 20, pointerId, pointerType, buttons: 0 });
}
