import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react";
import { clearStaleChunkReloadGuard } from "@/lib/staleChunkReload";
import { createClientSentryOptions } from "./sentry";

type Envelope = Parameters<ReturnType<NonNullable<Sentry.BrowserOptions["transport"]>>["send"]>[0];
const envelopes: Envelope[] = [];
const reload = vi.fn();
const events = () => envelopes.flatMap((envelope) => envelope[1].filter((item) => item[0].type === "event"));
const STALE = "Cannot read properties of undefined (reading 'component')";

beforeEach(() => {
  clearStaleChunkReloadGuard();
  sessionStorage.clear();
  reload.mockClear();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
  Sentry.init({ ...createClientSentryOptions("production", "https://public@example.com/1"),
    defaultIntegrations: false,
    transport: () => ({ send: async (envelope: Envelope) => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }) });
});

afterEach(async () => {
  await Sentry.close(1000);
  for (const scope of [Sentry.getCurrentScope(), Sentry.getIsolationScope()]) scope.setClient(undefined);
  envelopes.length = 0;
  clearStaleChunkReloadGuard();
});

describe("versión obsoleta tras publicar", () => {
  it("no envía a Sentry el fallo que se recupera recargando, y recarga una sola vez", async () => {
    Sentry.captureException(new Error(STALE));
    Sentry.captureException(new Error("Cannot read properties of undefined (reading 'default')"));
    await Sentry.flush(1000);
    expect(events()).toHaveLength(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("sí reporta cuando la guarda ya hizo 2 recargas y se rinde", async () => {
    sessionStorage.setItem("vite-preload-reload", JSON.stringify({ ts: Date.now(), count: 2 }));
    Sentry.captureException(new Error(STALE));
    await Sentry.flush(1000);
    expect(events()).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("los errores normales se siguen reportando sin recargar", async () => {
    Sentry.captureException(new Error("Cannot read properties of undefined (reading 'total')"));
    await Sentry.flush(1000);
    expect(events()).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
