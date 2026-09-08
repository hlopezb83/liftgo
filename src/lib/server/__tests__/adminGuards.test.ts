import { describe, expect, it } from "vitest";
import {
  generateSecurePassword,
  isEmail,
  isNonEmptyString,
  isUUID,
  isValidRole,
} from "../adminGuards.server";

describe("validadores de administración de usuarios", () => {
  it("isUUID acepta sólo UUID válidos", () => {
    expect(isUUID("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUUID("no-es-uuid")).toBe(false);
    expect(isUUID("")).toBe(false);
  });

  it("isEmail valida formato y longitud máxima", () => {
    expect(isEmail("hector@indimextrading.com")).toBe(true);
    expect(isEmail("sin-arroba")).toBe(false);
    expect(isEmail(`${"a".repeat(250)}@x.com`)).toBe(false);
  });

  it("isNonEmptyString respeta el tope de longitud", () => {
    expect(isNonEmptyString("Héctor", 200)).toBe(true);
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString("a".repeat(201), 200)).toBe(false);
  });

  it("isValidRole sólo acepta roles del sistema", () => {
    expect(isValidRole("admin")).toBe(true);
    expect(isValidRole("administrativo")).toBe(true);
    expect(isValidRole("superadmin")).toBe(false);
  });

  it("generateSecurePassword cumple los requisitos de fuerza", () => {
    for (let i = 0; i < 20; i++) {
      const pwd = generateSecurePassword();
      expect(pwd.length).toBe(20);
      expect(/[a-z]/.test(pwd)).toBe(true);
      expect(/[A-Z]/.test(pwd)).toBe(true);
      expect(/[0-9]/.test(pwd)).toBe(true);
      expect(/[^A-Za-z0-9]/.test(pwd)).toBe(true);
    }
    expect(generateSecurePassword(24).length).toBe(24);
  });
});
