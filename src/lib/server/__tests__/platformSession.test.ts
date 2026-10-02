import { describe, expect, it, vi } from "vitest";
import type { CallerClient } from "../guards/httpError";
import { requirePlatformSession } from "../guards/platformSession.server";
describe("sesión propia de plataforma", () => {
  it.each([null, {}, true, { id: "forged" }])("no acepta %j como sesión activa", async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await expect(requirePlatformSession({ rpc } as unknown as CallerClient)).rejects.toBeInstanceOf(Error);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_platform_session");
  });
  it("un fallo de la base no usa una sesión de caché", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "connection" } });
    await expect(requirePlatformSession({ rpc } as unknown as CallerClient)).rejects.toMatchObject({ status: 503 });
  });
});
