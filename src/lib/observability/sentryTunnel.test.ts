import { describe, expect, it, vi } from "vitest";
import {
  handleSentryTunnel,
  parseAllowedSentryDsn,
  SENTRY_TUNNEL_MAX_BYTES,
} from "./sentryTunnel.server";

const ALLOWED_DSN = "https://abc123@o4511415732404224.ingest.us.sentry.io/4511770994933760";

function makeEnvelope(dsn: string): string {
  return `${JSON.stringify({ dsn, event_id: "1234567890abcdef1234567890abcdef" })}\n{"type":"event"}\n{"message":"ok"}`;
}

describe("handleSentryTunnel", () => {
  it("parsea un DSN HTTPS válido y rechaza protocolos o proyectos inválidos", () => {
    expect(parseAllowedSentryDsn(ALLOWED_DSN)).toEqual({
      origin: "https://o4511415732404224.ingest.us.sentry.io",
      projectId: "4511770994933760",
    });
    expect(parseAllowedSentryDsn("http://abc@example.com/123")).toBeNull();
    expect(parseAllowedSentryDsn("https://abc@example.com/not-a-number")).toBeNull();
    expect(parseAllowedSentryDsn("")).toBeNull();
  });

  it("rechaza métodos distintos a POST con 405", async () => {
    const fetchMock = vi.fn();
    const res = await handleSentryTunnel(
      new Request("https://app.liftgo.mx/api/sentry-tunnel", { method: "GET" }),
      ALLOWED_DSN,
      fetchMock,
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bloquea SSRF cuando el host o el projectId del sobre no coinciden con el DSN permitido", async () => {
    const fetchMock = vi.fn();
    for (const badDsn of [
      "https://abc@evil.example.com/4511770994933760",
      "https://abc@o4511415732404224.ingest.us.sentry.io/9999999999",
    ]) {
      const res = await handleSentryTunnel(
        new Request("https://app.liftgo.mx/api/sentry-tunnel", {
          method: "POST",
          body: makeEnvelope(badDsn),
        }),
        ALLOWED_DSN,
        fetchMock,
      );
      expect(res.status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechaza sobres vacíos o malformados con 400 y cuerpos > 256 KiB con 413", async () => {
    const fetchMock = vi.fn();
    const emptyRes = await handleSentryTunnel(
      new Request("https://app.liftgo.mx/api/sentry-tunnel", { method: "POST", body: "" }),
      ALLOWED_DSN,
      fetchMock,
    );
    expect(emptyRes.status).toBe(400);

    const invalidRes = await handleSentryTunnel(
      new Request("https://app.liftgo.mx/api/sentry-tunnel", { method: "POST", body: "not-json\n{}" }),
      ALLOWED_DSN,
      fetchMock,
    );
    expect(invalidRes.status).toBe(400);

    const oversized = "x".repeat(SENTRY_TUNNEL_MAX_BYTES + 1);
    const largeRes = await handleSentryTunnel(
      new Request("https://app.liftgo.mx/api/sentry-tunnel", { method: "POST", body: oversized }),
      ALLOWED_DSN,
      fetchMock,
    );
    expect(largeRes.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reenvía sobres válidos al endpoint de Sentry sin cookies ni Authorization del cliente", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const res = await handleSentryTunnel(
      new Request("https://app.liftgo.mx/api/sentry-tunnel", {
        method: "POST",
        headers: {
          cookie: "sb-access-token=secret",
          authorization: "Bearer secret-jwt",
          "x-custom": "drop-me",
        },
        body: makeEnvelope(ALLOWED_DSN),
      }),
      ALLOWED_DSN,
      fetchMock,
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o4511415732404224.ingest.us.sentry.io/api/4511770994933760/envelope/");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/x-sentry-envelope" });
  });

  it("devuelve 502 si falla la red hacia Sentry", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("network down"); });
    const res = await handleSentryTunnel(
      new Request("https://app.liftgo.mx/api/sentry-tunnel", {
        method: "POST",
        body: makeEnvelope(ALLOWED_DSN),
      }),
      ALLOWED_DSN,
      fetchMock,
    );
    expect(res.status).toBe(502);
  });
});
