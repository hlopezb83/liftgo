import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureOperationalError } from "./captureOperationalError";

const sdk = vi.hoisted(() => ({ getClient: vi.fn(), withScope: vi.fn(), captureException: vi.fn(), setTag: vi.fn(), setContext: vi.fn() }));
vi.mock("./sentry", () => ({ Sentry: sdk }));

const networkError = () => Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError", status: 0 });
const setOnline = (online: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);

beforeEach(() => {
  vi.resetAllMocks();
  sdk.getClient.mockReturnValue({});
  sdk.withScope.mockImplementation((callback) => callback({ setTag: sdk.setTag, setContext: sdk.setContext }));
});
afterEach(() => vi.restoreAllMocks());

describe("fallas de red según la conexión del dispositivo", () => {
  it("no reporta el inicio de sesión fallido cuando el equipo no tiene internet", () => {
    setOnline(false);
    captureOperationalError(networkError(), { phase: "operation", errorCode: "NETWORK_ERROR" });
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it("sí reporta la falla de red cuando el equipo tiene internet", () => {
    setOnline(true);
    captureOperationalError(networkError(), { phase: "operation", errorCode: "NETWORK_ERROR" });
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
  });

  it("sin internet, un error interno distinto se sigue reportando", () => {
    setOnline(false);
    captureOperationalError(new Error("Fallo interno"), { phase: "query", errorCode: "INTERNAL_ERROR" });
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
  });
});
