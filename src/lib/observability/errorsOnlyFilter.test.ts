import { describe, expect, it } from "vitest";
import { createPrivacyOptions, isActionableEvent, scrubServerEvent } from "./privacyOptions";

describe("Sentry sólo recibe errores", () => {
  it("descarta warnings e info", () => {
    expect(isActionableEvent({ level: "warning" })).toBe(false);
    expect(isActionableEvent({ level: "info" })).toBe(false);
  });
  it("conserva error y fatal", () => {
    expect(isActionableEvent({ level: "error", exception: { values: [{ value: "TypeError x" }] } })).toBe(true);
    expect(isActionableEvent({ level: "fatal" })).toBe(true);
  });
  it("descarta validaciones esperadas del negocio", () => {
    expect(isActionableEvent({ level: "error", exception: { values: [{ value: "Invalid login credentials" }] } })).toBe(false);
    expect(isActionableEvent({ level: "error", exception: { values: [{ value: "LC_COT_VENCIDA: venció" }] } })).toBe(false);
  });

  it.each(["error", "fatal"])("conserva LC_ desconocidos en message y exception (%s)", (level) => {
    for (const value of ["LC_DATABASE_FAILURE: unavailable", "LC_COT_VENCIDA_EXTRA: venció", "LC_COT_VENCIDA sin delimitador"]) {
      expect(isActionableEvent({ level, message: value })).toBe(true);
      expect(isActionableEvent({ level, exception: { values: [{ value }] } })).toBe(true);
    }
  });

  it("conserva cualquier fatal, incluso una validación conocida", () => {
    expect(isActionableEvent({ level: "fatal", message: "LC_COT_VENCIDA: venció" })).toBe(true);
    expect(isActionableEvent({ level: "fatal", exception: { values: [{ value: "Invalid login credentials" }] } })).toBe(true);
  });

  it("sólo descarta mensajes canónicos enumerados, con delimitador exacto", () => {
    for (const message of ["LC_COT_VENCIDA:", "LC_COT_VENCIDA: venció", "No puedes restablecer la contraseña de un administrador"]) {
      expect(isActionableEvent({ level: "error", message })).toBe(false);
    }
    for (const message of ["LC_COT_VENCIDA : venció", "LC_COT_VENCIDA/venció", "LC_COT_VENCIDA: venció. TypeError: failure"]) {
      expect(isActionableEvent({ level: "error", message })).toBe(true);
    }
  });

  it("conserva cadenas mixtas y excepciones técnicas adicionales", () => {
    for (const message of [
      "LC_COT_VENCIDA: venció; TypeError: Cannot read properties of undefined",
      "LC_COT_VENCIDA: venció\npermission denied for table supplier_bills",
      "LC_COT_VENCIDA: venció LC_DATABASE_FAILURE: unavailable",
      "Invalid login credentials; database unavailable",
      "LC_COT_VENCIDA: detalle desconocido",
    ]) expect(isActionableEvent({ level: "error", message })).toBe(true);
    expect(isActionableEvent({ level: "error", message: "LC_COT_VENCIDA: venció", exception: { values: [{ value: "TypeError: technical failure" }] } })).toBe(true);
    expect(isActionableEvent({ level: "error", exception: { values: [{ value: "LC_COT_VENCIDA: venció" }, { value: "LC_UNKNOWN: technical failure" }] } })).toBe(true);
  });

  it("comparte filtro y saneamiento entre cliente y servidor", () => {
    const client = createPrivacyOptions().beforeSend;
    for (const message of ["LC_UNKNOWN: failure audit@example.com password=private-secret", "LC_COT_VENCIDA: venció; TypeError: failure audit@example.com"]) {
      const event = { level: "error", message, exception: { values: [{ value: message }] },
        extra: { body: { password: "private-secret" } }, request: { headers: { authorization: "Bearer opaque" }, data: { token: "opaque" } } };
      for (const clean of [client(event), scrubServerEvent(event)]) {
        expect(clean).not.toBeNull();
        expect(JSON.stringify(clean)).not.toContain("audit@example.com");
        expect(JSON.stringify(clean)).not.toContain("private-secret");
        expect(JSON.stringify(clean)).not.toContain("opaque");
      }
    }
    const expected = { level: "error", message: "LC_COT_VENCIDA: venció" };
    expect(client(expected)).toBeNull();
    expect(scrubServerEvent(expected)).toBeNull();
    for (const level of ["info", "warning"]) {
      expect(client({ level, message: "LC_UNKNOWN: failure" })).toBeNull();
      expect(scrubServerEvent({ level, message: "LC_UNKNOWN: failure" })).toBeNull();
    }
  });
});
