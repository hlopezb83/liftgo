import { describe, expect, it } from "vitest";
import { redactPII, scrubEvent, scrubUrl } from "./scrubPII";

describe("redactPII", () => {
  it("redacta email, RFC, CURP y JWT en un solo mensaje", () => {
    const raw =
      "Falla al facturar juan.perez@acme.mx (RFC XAXX010101000, CURP HEGG560427MVZRRL04) token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const out = redactPII(raw);
    expect(out).not.toMatch(/juan\.perez/);
    expect(out).not.toMatch(/XAXX010101000/);
    expect(out).not.toMatch(/HEGG560427/);
    expect(out).not.toMatch(/eyJhbGciOi/);
    expect(out).toContain("[REDACTED]");
  });

  it("preserva el mensaje operativo (código de error, folio no-PII)", () => {
    const raw = "invoice FAC-0094 no encontrada (status=404)";
    expect(redactPII(raw)).toBe(raw);
  });

  it("no rompe con null/undefined", () => {
    expect(redactPII(null)).toBe("");
    expect(redactPII(undefined)).toBe("");
  });
});

describe("scrubUrl", () => {
  it("redacta valores de claves sensibles conservando la clave", () => {
    const url = scrubUrl("/portal/statement?token=abc.def.ghi&customer=42");
    expect(url).toContain("token=%5BREDACTED%5D");
    expect(url).toContain("customer=42");
  });

  it("redacta email embebido en el path", () => {
    const url = scrubUrl("https://app.liftgo.mx/clientes/juan@acme.mx/detalle");
    expect(url).not.toMatch(/juan@acme/);
    expect(url).toContain("[REDACTED]");
  });

  it("es tolerante a URLs relativas malformadas", () => {
    const url = scrubUrl("javascript:void(0)?token=xxx");
    expect(url).not.toContain("xxx");
  });
});

describe("scrubEvent", () => {
  it("elimina email/username/ip del bloque user, preserva id", () => {
    const ev = scrubEvent({
      user: { id: "u_1", email: "a@b.com", username: "ana", ip_address: "1.2.3.4" },
    });
    expect(ev.user).toEqual({ id: "u_1" });
  });

  it("scrubbea exception.value, request.url, breadcrumbs y query_string", () => {
    const ev = scrubEvent({
      message: "usuario ana@x.mx no autorizada",
      request: {
        url: "https://app.liftgo.mx/api?token=xxx.yyy.zzz",
        query_string: "token=xxx.yyy.zzz",
        cookies: "sb-access-token=abc",
        headers: { Authorization: "Bearer eyJhbGciOi.aa.bb", "x-trace-id": "t_1" },
      },
      exception: { values: [{ value: "no se pudo cotizar para ana@x.mx" }] },
      breadcrumbs: [
        { message: "GET /clientes/ana@x.mx", data: { url: "/clientes/ana@x.mx?token=zzz" } },
      ],
    });
    expect(ev.message).not.toMatch(/ana@x/);
    expect(ev.request?.url).not.toMatch(/xxx\.yyy/);
    expect(ev.request?.query_string).toBe("[REDACTED]");
    expect(ev.request?.cookies).toBe("[REDACTED]");
    expect((ev.request?.headers as Record<string, unknown>).Authorization).toBe("[REDACTED]");
    expect((ev.request?.headers as Record<string, unknown>)["x-trace-id"]).toBe("t_1");
    expect(ev.exception?.values?.[0]?.value).not.toMatch(/ana@x/);
    expect(ev.breadcrumbs?.[0]?.message).not.toMatch(/ana@x/);
    const bcData = ev.breadcrumbs?.[0]?.data as Record<string, unknown> | undefined;
    expect(bcData?.url).not.toMatch(/ana@x/);
    expect(bcData?.url).not.toMatch(/zzz/);
  });
});
