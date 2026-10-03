import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeLastCapturedError, describeError, runWithRequestErrorCapture } from "../error-capture";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
afterEach(() => vi.restoreAllMocks());

describe("recuperación de errores SSR aislada por solicitud", () => {
  it("dos solicitudes intercaladas recuperan su propio error, una sola vez", async () => {
    const bLogged = deferred();
    const aConsumed = deferred();
    const errorA = new Error("request-a");
    const errorB = new Error("request-b");
    const a = runWithRequestErrorCapture(async () => {
      console.error(errorA);
      await bLogged.promise;
      const captured = consumeLastCapturedError();
      expect(consumeLastCapturedError()).toBeUndefined();
      aConsumed.resolve();
      return captured;
    });
    const b = runWithRequestErrorCapture(async () => {
      console.error(errorB);
      bLogged.resolve();
      await aConsumed.promise;
      return consumeLastCapturedError();
    });
    expect(await a).toBe(errorA);
    expect(await b).toBe(errorB);
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("un error fuera de la solicitud no se asigna a la siguiente", () => {
    console.error(new Error("outside-request"));
    expect(runWithRequestErrorCapture(consumeLastCapturedError)).toBeUndefined();
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("las solicitudes anidadas conservan y restauran su contexto propio", () => {
    const outer = new Error("outer");
    const inner = new Error("inner");
    runWithRequestErrorCapture(() => {
      console.error(outer);
      runWithRequestErrorCapture(() => {
        console.error(inner);
        expect(consumeLastCapturedError()).toBe(inner);
      });
      expect(consumeLastCapturedError()).toBe(outer);
    });
  });

  it("descarta errores vencidos sin contaminar una solicitud nueva", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    runWithRequestErrorCapture(() => {
      console.error(new Error("expired"));
      clock.mockReturnValue(6001);
      expect(consumeLastCapturedError()).toBeUndefined();
    });
    expect(runWithRequestErrorCapture(consumeLastCapturedError)).toBeUndefined();
  });

  it("mantiene la descripción y causa original para el diagnóstico del servidor", () => {
    const error = new Error("outer-message", { cause: new Error("inner-message") });
    expect(describeError(error)).toContain("outer-message");
    expect(describeError(error)).toContain("caused by:");
    expect(describeError(error)).toContain("inner-message");
  });
});
