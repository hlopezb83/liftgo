import { describe, it, expect } from "vitest";
import { cancelCfdiSchema } from "../cancelCfdiSchema";

/**
 * Top-10 #9 (Auditoría de Tests): cancelación motivo 01 sin substitution_uuid
 * debe fallar en cliente antes de invocar la edge function. Regresión que
 * evitaría un round-trip caro y un rechazo CFDI-40224 del PAC.
 */
describe("cancelCfdiSchema", () => {
  it("motivo 02 sin UUID → válido", () => {
    const r = cancelCfdiSchema.safeParse({ motive: "02", substitutionUuid: "" });
    expect(r.success).toBe(true);
  });

  it("motivo 01 sin UUID → bloqueado con error en substitutionUuid", () => {
    const r = cancelCfdiSchema.safeParse({ motive: "01", substitutionUuid: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("substitutionUuid");
    }
  });

  it.each([
    "not-a-uuid",
    "12345678-1234-1234-1234-12345678", // corto
    "12345678-1234-1234-1234-1234567890AB-EXTRA",
    "gggggggg-gggg-gggg-gggg-gggggggggggg", // no-hex
  ])("motivo 01 con UUID inválido %s → bloqueado", (bad) => {
    const r = cancelCfdiSchema.safeParse({ motive: "01", substitutionUuid: bad });
    expect(r.success).toBe(false);
  });

  it("motivo 01 con UUID válido (con espacios) → válido tras trim", () => {
    const r = cancelCfdiSchema.safeParse({
      motive: "01",
      substitutionUuid: "  12345678-1234-4234-8234-123456789abc  ",
    });
    expect(r.success).toBe(true);
  });

  it("motivo 03/04 sin UUID → válido (no requieren sustitución)", () => {
    expect(
      cancelCfdiSchema.safeParse({ motive: "03", substitutionUuid: "" }).success,
    ).toBe(true);
    expect(
      cancelCfdiSchema.safeParse({ motive: "04", substitutionUuid: "" }).success,
    ).toBe(true);
  });

  it("motive vacío → bloqueado (guard base)", () => {
    const r = cancelCfdiSchema.safeParse({ motive: "", substitutionUuid: "" });
    expect(r.success).toBe(false);
  });
});
