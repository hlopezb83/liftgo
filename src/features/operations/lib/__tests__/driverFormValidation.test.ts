import { describe, it, expect } from "vitest";
import { validateDriverForm } from "../driverFormValidation";

describe("validateDriverForm", () => {
  it("exige nombre no vacío", () => {
    expect(validateDriverForm({ name: "   ", email: "" })).toEqual({
      field: "name",
      message: "El nombre es requerido",
    });
  });

  it("acepta correo vacío (opcional)", () => {
    expect(validateDriverForm({ name: "Juan", email: "" })).toBeNull();
  });

  it("rechaza correo mal formado", () => {
    expect(validateDriverForm({ name: "Juan", email: "no-arroba" })).toEqual({
      field: "email",
      message: "Correo inválido",
    });
  });

  it("acepta correo válido", () => {
    expect(validateDriverForm({ name: "Juan", email: "j@x.com" })).toBeNull();
  });
});
