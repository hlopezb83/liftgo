import { describe, it, expect } from "vitest";
import { getAuthErrorMessage } from "../authErrorMessages";

describe("getAuthErrorMessage", () => {
  it("traduce credenciales inválidas", () => {
    expect(getAuthErrorMessage(new Error("Invalid login credentials"))).toBe(
      "Correo o contraseña incorrectos.",
    );
  });

  it("traduce correo no confirmado", () => {
    expect(getAuthErrorMessage(new Error("Email not confirmed"))).toBe(
      "Tu correo aún no ha sido confirmado. Revisa tu bandeja de entrada.",
    );
  });

  it("traduce usuario inexistente", () => {
    expect(getAuthErrorMessage(new Error("User not found"))).toBe(
      "No encontramos una cuenta con ese correo.",
    );
  });

  it("traduce límite de intentos", () => {
    expect(getAuthErrorMessage(new Error("Email rate limit exceeded"))).toBe(
      "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    );
    expect(getAuthErrorMessage(new Error("Too many requests"))).toBe(
      "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    );
  });

  it("traduce contraseña corta y correo inválido", () => {
    expect(getAuthErrorMessage(new Error("Password should be at least 6 characters"))).toBe(
      "La contraseña es demasiado corta.",
    );
    expect(getAuthErrorMessage(new Error("Invalid email"))).toBe(
      "El correo electrónico no es válido.",
    );
  });

  it("traduce errores de red", () => {
    expect(getAuthErrorMessage(new Error("Failed to fetch"))).toBe(
      "No pudimos conectar con el servidor. Revisa tu conexión.",
    );
  });

  it("traduce cuenta deshabilitada", () => {
    expect(getAuthErrorMessage(new Error("User is banned"))).toBe(
      "Tu cuenta está deshabilitada. Contacta al administrador.",
    );
  });

  it("acepta valores que no son Error", () => {
    expect(getAuthErrorMessage("Invalid login credentials")).toBe(
      "Correo o contraseña incorrectos.",
    );
  });

  it("usa el mensaje genérico cuando no hay coincidencia", () => {
    expect(getAuthErrorMessage(new Error("Something exploded"))).toBe(
      "No pudimos completar la operación. Inténtalo de nuevo.",
    );
    expect(getAuthErrorMessage(null)).toBe(
      "No pudimos completar la operación. Inténtalo de nuevo.",
    );
    expect(getAuthErrorMessage(undefined)).toBe(
      "No pudimos completar la operación. Inténtalo de nuevo.",
    );
  });
});
