import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/cloudflare";
import { captureServerError, createServerSentryOptions, setVerifiedServerIdentity, withServerSentry } from "./serverSentry.server";
import { createPrivacyOptions, scrubServerEvent } from "./privacyOptions";

type Envelope = Parameters<ReturnType<NonNullable<Sentry.CloudflareOptions["transport"]>>["send"]>[0];
const envelopes: Envelope[] = [];
const clients = new Set<Sentry.CloudflareClient>();
const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let transportFailure = false;
const options = (): Sentry.CloudflareOptions => ({ ...createPrivacyOptions(),
  dsn: "https://public@example.com/1", release: "liftgo@server-test", environment: "test",
  tracesSampleRate: 0, beforeSend: scrubServerEvent,
  integrations: (integrations) => integrations.filter(({ name }) => name !== "Console"),
  transport: () => ({ send: async (envelope: Envelope) => {
    if (transportFailure) throw new Error("transport unavailable");
    envelopes.push(envelope); return { statusCode: 200 };
  }, flush: async () => true }),
});
const events = () => envelopes.flatMap((envelope) => envelope[1].filter((item) => item[0].type === "event").map((item) => item[1] as Sentry.Event));
const trackClient = () => { const client = Sentry.getClient<Sentry.CloudflareClient>(); if (client) clients.add(client); };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };
const request = () => new Request("https://liftgo.lovable.app/customers/" + idA + "?secret=private-query#private-fragment", {
  headers: { authorization: "Bearer private-auth", cookie: "session=private-cookie", "x-organization-id": "forged-org", "x-user-id": "forged-actor" },
});

afterEach(() => { envelopes.length = 0; transportFailure = false; vi.unstubAllEnvs(); });
afterAll(async () => { for (const client of clients) { await client.flush(1000); client.dispose(); } });

describe("SDK oficial de servidor, con cliente compartido y transporte offline", () => {
  it("aísla dos empresas concurrentes y no conserva identidad en la solicitud siguiente", async () => {
    const bReady = deferred(); const aDone = deferred();
    const a = withServerSentry(request(), {}, undefined, async () => {
      trackClient(); setVerifiedServerIdentity({ userId: "actor-a", organizationId: idA, role: "admin", workspace: "organization" });
      await bReady.promise;
      captureServerError(new Error("failure-a")); aDone.resolve(); return new Response("a");
    }, options());
    const b = withServerSentry(request(), {}, undefined, async () => {
      trackClient(); setVerifiedServerIdentity({ userId: "actor-b", organizationId: idB, role: "sales", workspace: "organization" });
      bReady.resolve(); await aDone.promise;
      captureServerError(new Error("failure-b")); return new Response("b");
    }, options());
    expect(await (await a).text()).toBe("a"); expect(await (await b).text()).toBe("b");
    expect(events()).toHaveLength(2);
    for (const [message, actor, org, role] of [["failure-a", "actor-a", idA, "admin"], ["failure-b", "actor-b", idB, "sales"]]) {
      const event = events().find((item) => item.exception?.values?.some((value) => value.value === message));
      expect(event?.user).toEqual({ id: actor }); expect(event?.tags).toMatchObject({ organization_id: org, role });
    }
    await withServerSentry(request(), {}, undefined, () => { captureServerError(new Error("anonymous")); return new Response("ok"); }, options());
    expect(events()[2].user?.id).toBeUndefined(); expect(events()[2].tags?.organization_id).toBeUndefined();
    expect(JSON.stringify(events()[2])).not.toContain("forged-org"); expect(JSON.stringify(events()[2])).not.toContain("forged-actor");
  });

  it("sanea el envelope real, mantiene stack y release, y deduplica el mismo fallo", async () => {
    const error = new Error('audit@example.com password="private pass phrase"');
    await withServerSentry(request(), {}, undefined, () => {
      trackClient(); Sentry.setExtra("body", { customer: "private-customer" });
      Sentry.setExtra("unknownBusinessField", "private-arbitrary-row");
      captureServerError(error); captureServerError(error); return new Response("ok");
    }, options());
    expect(events()).toHaveLength(1); const event = events()[0];
    expect(event.sdk?.version).toBe("11.4.0"); expect(event.release).toBe("liftgo@server-test");
    expect(event.exception?.values?.[0].stacktrace?.frames?.length).toBeGreaterThan(0);
    expect(event.request?.url).toBe("/customers/:id"); expect(event.request?.headers).toBeUndefined();
    for (const privateValue of ["private-auth", "private-cookie", "private-query", "private-fragment", "private pass phrase", "audit@example.com", "private-customer", "private-arbitrary-row"])
      expect(JSON.stringify(event)).not.toContain(privateValue);
  });

  it("omite rechazos esperados, pero conserva fallos de disponibilidad", async () => {
    await withServerSentry(request(), {}, undefined, () => {
      for (const status of [400, 401, 403, 404, 409, 422, 429]) captureServerError(Object.assign(new Error("business"), { status }));
      captureServerError(new Error("Unauthorized: Invalid token"));
      captureServerError(Object.assign(new Error("verification unavailable"), { status: 503 }));
      return new Response("ok");
    }, options());
    expect(events()).toHaveLength(1); expect(events()[0].exception?.values?.[0].value).toBe("verification unavailable");
  });

  it("el espacio de plataforma retira la empresa y usa sólo el actor verificado", async () => {
    await withServerSentry(request(), {}, undefined, () => {
      setVerifiedServerIdentity({ userId: "actor", organizationId: idA, role: "admin", workspace: "organization" });
      setVerifiedServerIdentity({ userId: "actor", workspace: "platform" });
      captureServerError(new Error("platform-error")); return new Response("ok");
    }, options());
    expect(events()[0].tags).toMatchObject({ workspace: "platform", role: "platform_operator" });
    expect(events()[0].tags?.organization_id).toBeUndefined(); expect(events()[0].user).toEqual({ id: "actor" });
  });

  it("obtiene waitUntil desde Nitro y devuelve el stream sin consumirlo", async () => {
    const pending: Promise<unknown>[] = [];
    const req = request() as Request & { runtime?: unknown };
    req.runtime = { cloudflare: { context: { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } } } };
    const response = await withServerSentry(req, {}, undefined, () => {
      captureServerError(new Error("stream-error"));
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("event: ok\n\n")); controller.close(); } }),
        { headers: { "content-type": "text/event-stream", "x-result": "preserved" } });
    }, options());
    expect(response.headers.get("x-result")).toBe("preserved"); expect(response.bodyUsed).toBe(false);
    expect(await response.text()).toBe("event: ok\n\n");
    await Promise.allSettled(pending); expect(events()).toHaveLength(1);
  });

  it("usa también waitUntil adjunto al Request o recibido por el worker", async () => {
    for (const mode of ["request", "worker"]) {
      const pending: Promise<unknown>[] = [];
      const ctx = { waitUntil(promise: Promise<unknown>) { pending.push(promise); } };
      const req = request() as Request & { waitUntil?: typeof ctx.waitUntil };
      if (mode === "request") req.waitUntil = ctx.waitUntil.bind(ctx);
      const response = await withServerSentry(req, {}, mode === "worker" ? ctx : undefined, () => {
        captureServerError(new Error(mode)); return new Response("ok");
      }, options());
      expect(await response.text()).toBe("ok");
      expect(pending.length).toBeGreaterThan(0); await Promise.allSettled(pending);
    }
    expect(events()).toHaveLength(2);
  });

  it("un error de transporte no cambia la respuesta ni repite la operación", async () => {
    transportFailure = true;
    const handler = vi.fn(() => { captureServerError(new Error("incident")); return new Response("saved", { status: 201 }); });
    const response = await withServerSentry(request(), {}, undefined, handler, options());
    expect(response.status).toBe(201); expect(await response.text()).toBe("saved"); expect(handler).toHaveBeenCalledTimes(1);
  });

  it("en fetch-only envía el error antes de devolver un stream abierto", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = await withServerSentry(request(), {}, undefined, () => {
      captureServerError(new Error("open-stream-error"));
      return new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { "content-type": "text/event-stream" } });
    }, options());
    expect(events()).toHaveLength(1); expect(response.bodyUsed).toBe(false);
    controller.enqueue(new TextEncoder().encode("ok")); controller.close();
    expect(await response.text()).toBe("ok");
  });

  it("un transporte que nunca termina tiene un presupuesto total acotado", async () => {
    let client: Sentry.CloudflareClient | undefined;
    const config = { ...options(), cacheClient: false, transport: () => ({
      send: async () => ({ statusCode: 200 }), flush: () => new Promise<boolean>(() => {}),
    }) };
    const started = performance.now();
    const handler = vi.fn(() => {
      client = Sentry.getClient<Sentry.CloudflareClient>(); captureServerError(new Error("hung-transport"));
      return new Response("saved", { status: 201 });
    });
    try {
      const response = await withServerSentry(request(), {}, undefined, handler, config);
      expect(performance.now() - started).toBeLessThan(3000);
      expect(response.status).toBe(201); expect(handler).toHaveBeenCalledTimes(1);
      await response.body?.cancel();
    } finally { client?.dispose(); }
  });

  it("si falla la inicialización del SDK, ejecuta el negocio una sola vez", async () => {
    const config = { ...options(), cacheClient: false };
    Object.defineProperty(config, "dsn", { get() { throw new Error("SDK initialization failed"); } });
    const handler = vi.fn(() => new Response("saved", { status: 201 }));
    const response = await withServerSentry(request(), {}, undefined, handler, config);
    expect(response.status).toBe(201); expect(handler).toHaveBeenCalledTimes(1);
  });

  it("no inicializa Sentry en desarrollo o cuando el DSN está vacío", async () => {
    vi.stubEnv("PROD", false); vi.stubEnv("VITE_SENTRY_FORCE", "");
    expect(createServerSentryOptions({})).toBeUndefined();
    vi.stubEnv("PROD", true);
    expect(createServerSentryOptions({ SENTRY_DSN: "" })).toBeUndefined();
    const runtimeRequest = request() as Request & { runtime?: unknown };
    runtimeRequest.runtime = { cloudflare: { env: { SENTRY_DSN: "" } } };
    expect(await (await withServerSentry(runtimeRequest, undefined, undefined, () => new Response("runtime-disabled"))).text()).toBe("runtime-disabled");
    const handler = vi.fn(() => new Response("disabled"));
    expect(await (await withServerSentry(request(), { SENTRY_DSN: "" }, undefined, handler)).text()).toBe("disabled");
    expect(handler).toHaveBeenCalledTimes(1); expect(events()).toHaveLength(0);
  });
});
