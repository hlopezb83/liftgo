import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPORT_REQUEST_TIMEOUT_MS, SupportRequestTimeout, withSupportRequest } from "../supportRequest";

describe("espera de soporte con resultado incierto", () => {
  afterEach(() => vi.useRealTimers());
  it("libera una solicitud colgada, aborta su transporte y no la repite", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let finish: (value: string) => void = () => {};
    const run = vi.fn((value: AbortSignal) => { signal = value; return new Promise<string>((resolve) => { finish = resolve; }); });
    const result = withSupportRequest(run);
    const failed = expect(result).rejects.toBeInstanceOf(SupportRequestTimeout);
    await vi.advanceTimersByTimeAsync(SUPPORT_REQUEST_TIMEOUT_MS);
    await failed;
    expect(signal?.aborted).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    finish("committed after response was lost");
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("limpia la espera al recibir el resultado o el error original", async () => {
    vi.useFakeTimers();
    await expect(withSupportRequest(async () => "confirmed")).resolves.toBe("confirmed");
    const original = { code: "40001", message: "El caso cambió" };
    await expect(withSupportRequest(async () => { throw original; })).rejects.toBe(original);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("lleva la cancelación de la consulta al transporte", async () => {
    const parent = new AbortController();
    let signal: AbortSignal | undefined;
    const result = withSupportRequest((value) => { signal = value; return new Promise<void>((_, reject) => value.addEventListener("abort", () => reject(value.reason))); }, parent.signal);
    await Promise.resolve();
    const reason = new Error("query cancelled");
    parent.abort(reason);
    await expect(result).rejects.toBe(reason);
    expect(signal?.aborted).toBe(true);
  });
});
