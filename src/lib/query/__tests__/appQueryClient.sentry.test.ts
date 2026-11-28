import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleSessionExpired: vi.fn(async () => false),
  captureOperationalError: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("@/lib/auth/sessionExpiry", () => ({ handleSessionExpired: mocks.handleSessionExpired }));
vi.mock("@/lib/observability/captureOperationalError", () => ({ captureOperationalError: mocks.captureOperationalError }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: mocks.notifyError }));

import { createAppQueryClient } from "../appQueryClient";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handleSessionExpired.mockResolvedValue(false);
});

describe("createAppQueryClient — captura operativa en Sentry", () => {
  it("reporta a Sentry una query con meta.silent=true sin mostrar toast global", async () => {
    const client = createAppQueryClient();
    const boom = new Error("DB 500");
    await client.fetchQuery({
      queryKey: ["silent-test"],
      queryFn: () => Promise.reject(boom),
      retry: false,
      meta: { silent: true },
    }).catch(() => undefined);
    await Promise.resolve();
    expect(mocks.notifyError).not.toHaveBeenCalled();
    expect(mocks.captureOperationalError).toHaveBeenCalledWith(boom, { phase: "query" });
  });

  it("reporta a Sentry una mutación con onError local sin mostrar toast global duplicado", async () => {
    const client = createAppQueryClient();
    const boom = new Error("Mutation 500");
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(boom),
      onError: vi.fn(),
    });
    await mutation.execute(undefined).catch(() => undefined);
    await Promise.resolve();
    expect(mocks.notifyError).not.toHaveBeenCalled();
    expect(mocks.captureOperationalError).toHaveBeenCalledWith(boom, { phase: "mutation" });
  });
});
