import { describe, expect, it } from "vitest";
import { redactPII, scrubData, scrubEvent, scrubSpan, scrubUrl } from "./scrubPII";
import { scrubReplayFrame } from "./replay";

const key = "sk_" + "test_" + "AUDIT_NOT_A_REAL_KEY";
const id = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

describe("canales independientes de privacidad", () => {
  it("elimina contraseñas entre comillas que contienen espacios y claves dentro de links de spans", () => {
    expect(redactPII('password="private pass phrase" token=opaque')).toBe("password=[REDACTED] token=[REDACTED]");
    expect(redactPII("secret='private pass phrase'")).toBe("secret=[REDACTED]");
    expect(JSON.stringify(scrubSpan({ name: "operation", attributes: {}, links: [{ trace_id: "abcdef1234567890abcdef1234567890", attributes: { password: "private pass phrase" } }] })))
      .not.toContain("private pass phrase");
  });
  it("no confunde identificadores técnicos con teléfonos al recorrer todo el evento", () => {
    const input = { event_id: "12345678901234567890123456789012",
      contexts: { trace: { trace_id: "abcdef1234567890abcdef1234567890", span_id: "1234567890123456" } },
      tags: { organization_id: "52555555-1234-1234-1234-123456789012" }, extra: { phone: "5551234567" } };
    const out = scrubEvent(input);
    expect(out.event_id).toBe(input.event_id);
    expect(out.contexts.trace).toEqual(input.contexts.trace);
    expect(out.tags).toEqual(input.tags);
    expect(out.extra.phone).toBe("[REDACTED]");
  });
  it("elimina credenciales anidadas, argumentos de console y cuerpos sin mutar el original", () => {
    const source = { message: key, extra: { apiKey: key, body: { company: "Privada" } },
      contexts: { audit: { password: "arbitrary-secret", "refresh_token": "opaque", deep: [{ email: "audit@example.com" }] } },
      breadcrumbs: [{ data: { arguments: ["audit@example.com", key] } }] };
    const serialized = JSON.stringify(scrubEvent(source));
    for (const secret of [key, "arbitrary-secret", "opaque", "audit@example.com", "Privada"]) expect(serialized).not.toContain(secret);
    expect(source.extra.apiKey).toBe(key);
  });

  it("elimina fragmentos OAuth y filtros no conocidos en URLs absolutas y relativas", () => {
    for (const prefix of ["", "https://liftgo.lovable.app"]) {
      expect(scrubUrl(prefix + "/auth?custom=private#access_token=opaque")).toBe("/auth");
      expect(scrubUrl(prefix + "/customers/" + id)).toBe("/customers/:id");
      expect(scrubUrl(prefix + "/customers/audit%40example.com")).not.toContain("audit");
    }
  });

  it("conserva las rutas de scripts para symbolication, sin URL de recuperación", () => {
    expect(scrubData({ filename: "https://liftgo.lovable.app/assets/client-ab.js?token=opaque#private" }))
      .toEqual({ filename: "https://liftgo.lovable.app/assets/client-ab.js" });
  });

  it("no ejecuta getters, tolera ciclos y acota colecciones", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    Object.defineProperty(cyclic, "password", { enumerable: true, get() { throw new Error("Getter ejecutado"); } });
    expect(scrubData(cyclic)).toEqual({ self: "[REDACTED]", password: "[REDACTED]" });
    expect(scrubData(Array.from({ length: 150 }, () => "safe"))).toHaveLength(100);
  });

  it("filtra datos de spans stream aunque beforeSend no se ejecute", () => {
    const out = scrubSpan({ name: "/customers/" + id, attributes: { "url.full": "/auth?code=opaque#private",
      "params.id": id, "url.path.parameter.id": id, "http.request.header.authorization": "raw",
      "http.response.body": "private", apiKey: key, organization_id: "verified-org", status: 500 } });
    expect(out.name).toBe("/customers/:id");
    expect(out.attributes).toEqual({ "url.full": "/auth", apiKey: "[REDACTED]", organization_id: "verified-org", status: 500 });
  });

  it("redacta metadatos de Replay y descarta sus eventos de console/input/click", () => {
    const out = scrubEvent({ urls: ["/auth#access_token=opaque"], extra: { key } });
    expect(JSON.stringify(out)).not.toContain("opaque");
    for (const category of ["console", "console.error", "ui.input", "ui.click"]) {
      expect(scrubReplayFrame({ type: 5, timestamp: 1, data: { tag: "breadcrumb", payload: { type: "default", timestamp: 1, category, data: { arguments: [key] } } } })).toBeNull();
    }
    expect(JSON.stringify(scrubReplayFrame({ type: 5, timestamp: 1, data: { tag: "breadcrumb", payload: { type: "navigation", timestamp: 1, category: "navigation", data: { to: "/auth#access_token=opaque" } } } })))
      .not.toContain("opaque");
  });
});
