import { afterEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react";
import { createClientSentryOptions } from "./sentry";
import { clearSentryIdentity, syncSentryIdentity } from "./identity";
import { captureOperationalError } from "./captureOperationalError";

type Envelope = Parameters<ReturnType<NonNullable<Sentry.BrowserOptions["transport"]>>["send"]>[0];
const envelopes: Envelope[] = [];
const options = (): Sentry.BrowserOptions => ({ ...createClientSentryOptions("production", "https://public@example.com/1"),
  defaultIntegrations: false, tracesSampleRate: 1,
  transport: () => ({ send: async (envelope: Envelope) => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }) });
const events = () => envelopes.flatMap((envelope) => envelope[1].filter((item) => item[0].type === "event").map((item) => item[1]));

afterEach(async () => {
  clearSentryIdentity();
  await Sentry.close(1000);
  for (const scope of [Sentry.getCurrentScope(), Sentry.getIsolationScope()]) {
    scope.clearBreadcrumbs();
    scope.setClient(undefined);
  }
  envelopes.length = 0;
  vi.unstubAllEnvs();
});

describe("SDK real con transporte en memoria, sin red", () => {
  it("envía un incidente saneado y conserva versión, código y empresa verificada", async () => {
    Sentry.init(options());
    syncSentryIdentity({ userId: "actor-a", organizationId: "org-a", role: "admin", workspace: "organization" });
    Sentry.setExtra("apiKey", "sk_" + "test_" + "AUDIT_NOT_A_REAL_KEY");
    const error = new Error("Falló audit@example.com password=arbitrary-secret");
    captureOperationalError(error, { phase: "mutation", errorCode: "INTERNAL_ERROR" });
    captureOperationalError(error, { phase: "mutation", errorCode: "INTERNAL_ERROR" });
    await Sentry.flush(1000);
    expect(events()).toHaveLength(1);
    const event = events()[0] as Sentry.Event;
    expect(event.sdk?.version).toBe("11.4.0");
    expect(event.tags).toMatchObject({ organization_id: "org-a", role: "admin", phase: "mutation" });
    expect(event.user).toEqual({ id: "actor-a" });
    for (const privateValue of ["arbitrary-secret", "audit@example.com", "AUDIT_NOT_A_REAL_KEY"]) expect(JSON.stringify(event)).not.toContain(privateValue);
  });

  it("cambia empresa, limpia breadcrumbs previos y retira identidad al salir", async () => {
    Sentry.init(options());
    syncSentryIdentity({ userId: "actor-a", organizationId: "org-a", role: "admin", workspace: "organization" });
    Sentry.addBreadcrumb({ message: "old-company-operation" });
    syncSentryIdentity({ userId: "actor-b", organizationId: "org-b", role: "sales", workspace: "organization" });
    Sentry.captureMessage("new-company-operation");
    await Sentry.flush(1000);
    const event = events()[0] as Sentry.Event;
    expect(event.tags?.organization_id).toBe("org-b");
    expect(event.contexts?.route?.route).toBe("/");
    expect(JSON.stringify(event)).not.toContain("old-company-operation");
    clearSentryIdentity();
    Sentry.captureMessage("signed-out");
    await Sentry.flush(1000);
    const signedOut = events()[1] as Sentry.Event;
    expect(signedOut.user?.id).toBeUndefined();
    expect(signedOut.tags?.organization_id).toBeUndefined();
    expect(signedOut.tags?.role).toBeUndefined();
  });

  it("suprime validaciones, conflictos esperados y warnings", async () => {
    Sentry.init(options());
    captureOperationalError(new Error("Validación"), { errorCode: "VALIDATION_FAILED" });
    captureOperationalError(Object.assign(new Error("Conflicto"), { status: 409 }), { errorCode: "UNKNOWN" });
    captureOperationalError(new Error("Aviso"), { severity: "warning", errorCode: "UNKNOWN" });
    await Sentry.flush(1000);
    expect(events()).toHaveLength(0);
  });

  it("envía spans stream con filtros propios y no habilita Replay por defecto", async () => {
    vi.stubEnv("VITE_SENTRY_REPLAY", "");
    const config = options();
    expect(config.replaysSessionSampleRate).toBe(0);
    expect(config.replaysOnErrorSampleRate).toBe(0);
    Sentry.init(config);
    syncSentryIdentity({ userId: "actor-a", organizationId: "org-a", role: "admin", workspace: "organization" });
    Sentry.startSpan({ name: "/customers/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", attributes: { "url.full": "/auth#access_token=opaque", "params.id": "private-id" } }, () => {});
    await Sentry.flush(1000);
    const spans = envelopes.flatMap((envelope) => envelope[1].filter((item) => item[0].type === "span").map((item) => item[1]));
    expect(spans.length).toBeGreaterThan(0);
    expect(JSON.stringify(spans)).not.toContain("opaque");
    expect(JSON.stringify(spans)).not.toContain("private-id");
    expect(JSON.stringify(spans)).toContain("org-a");
  });
});
