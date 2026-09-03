import { describe, it, expect } from "vitest";
import { pickInspectorName, resolveInspectorName } from "../inspectorIdentity";

/**
 * Hallazgo 9: `inspected_by` se guarda automáticamente con el usuario
 * autenticado; sólo un admin puede registrar a otro inspector.
 */
describe("resolveInspectorName", () => {
  it("prefiere full_name del usuario autenticado", () => {
    expect(
      resolveInspectorName({ email: "ana@liftgo.mx", user_metadata: { full_name: "Ana López" } }),
    ).toBe("Ana López");
  });

  it("cae al correo cuando no hay full_name", () => {
    expect(resolveInspectorName({ email: "ana@liftgo.mx", user_metadata: {} })).toBe("ana@liftgo.mx");
    expect(resolveInspectorName({ email: "ana@liftgo.mx", user_metadata: { full_name: "   " } })).toBe("ana@liftgo.mx");
  });

  it("devuelve cadena vacía sin usuario (el flujo valida y bloquea)", () => {
    expect(resolveInspectorName(null)).toBe("");
    expect(resolveInspectorName(undefined)).toBe("");
  });
});

describe("pickInspectorName", () => {
  it("no-admin: siempre guarda al usuario autenticado, ignorando el texto", () => {
    expect(
      pickInspectorName({ isAdmin: false, formValue: "Otro Nombre", currentUserName: "Ana López" }),
    ).toBe("Ana López");
  });

  it("admin: puede registrar a otro inspector si captura un nombre", () => {
    expect(
      pickInspectorName({ isAdmin: true, formValue: "  Carlos Ruiz ", currentUserName: "Ana López" }),
    ).toBe("Carlos Ruiz");
  });

  it("admin sin texto: usa su propio usuario", () => {
    expect(
      pickInspectorName({ isAdmin: true, formValue: "   ", currentUserName: "Ana López" }),
    ).toBe("Ana López");
  });
});
