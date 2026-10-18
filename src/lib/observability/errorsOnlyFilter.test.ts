import { describe, expect, it } from "vitest";
import { isActionableEvent } from "./privacyOptions";

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
});
