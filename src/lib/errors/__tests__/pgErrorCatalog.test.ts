import { describe, it, expect } from "vitest";
import { translatePgError } from "../pgErrorCatalog";
import { getErrorMessage } from "../index";

describe("translatePgError — nivel 1: nombre de restricción", () => {
  it("RFC de cliente duplicado se reconoce por el nombre del índice", () => {
    const err = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "customers_rfc_unique"',
      details: "Key (rfc)=(XAXX010101000) already exists.",
    };
    const r = translatePgError(err, "Error al guardar cliente");
    expect(r.matched).toBe(true);
    expect(r.constraint).toBe("customers_rfc_unique");
    expect(r.severity).toBe("warning");
    expect(r.message).toBe("Ya existe un cliente con ese RFC.");
  });

  it("el nombre de la restricción gana sobre el SQLSTATE genérico", () => {
    const err = {
      code: "23505",
      message: "duplicate key value",
      details: 'Key already exists: forklifts_serial_number_unique',
    };
    expect(translatePgError(err).message).toMatch(/número de serie/i);
  });

  it("orden de etapa del CRM ocupado", () => {
    const err = { code: "23505", message: 'violates unique constraint "prospects_stage_order_uniq"' };
    expect(translatePgError(err).message).toMatch(/lugar en la etapa/i);
  });

  it("movimiento bancario duplicado por hash", () => {
    const err = { code: "23505", message: 'duplicate key "bank_statement_lines_account_hash_uq"' };
    expect(translatePgError(err).message).toMatch(/ya fue importado/i);
  });
});

describe("translatePgError — nivel 2: SQLSTATE", () => {
  it("23503 explica registros relacionados", () => {
    const r = translatePgError({ code: "23503", message: "update or delete violates foreign key" });
    expect(r.sqlstate).toBe("23503");
    expect(r.severity).toBe("warning");
    expect(r.message).toMatch(/registros relacionados/i);
  });

  it("23514 traduce checks de negocio", () => {
    const r = translatePgError({ code: "23514", message: "new row violates check constraint" });
    expect(r.message).toMatch(/reglas del negocio/i);
  });

  it("23502 pide el dato obligatorio", () => {
    expect(translatePgError({ code: "23502", message: "null value in column" }).message).toMatch(
      /dato obligatorio/i,
    );
  });

  it("22P02 marca formato inválido", () => {
    expect(translatePgError({ code: "22P02", message: "invalid input syntax for type uuid" }).message).toMatch(
      /formato inválido/i,
    );
  });

  it("42501 es crítico y habla de permisos", () => {
    const r = translatePgError({ code: "42501", message: "permission denied for table invoices" });
    expect(r.severity).toBe("critical");
    expect(r.title).toBe("Sin permisos");
  });

  it("40001 sugiere reintentar", () => {
    const r = translatePgError({ code: "40001", message: "could not serialize access" });
    expect(r.title).toBe("Conflicto de concurrencia");
    expect(r.severity).toBe("warning");
  });

  it("P0001 respeta el mensaje del RAISE porque ya viene redactado", () => {
    const err = {
      code: "P0001",
      message: "Esta extensión de reserva ya fue facturada. Cancela la factura anterior primero.",
    };
    const r = translatePgError(err, "Error al facturar");
    expect(r.matched).toBe(true);
    expect(r.severity).toBe("warning");
    expect(r.message).toBe(err.message);
  });

  it("PGRST116 indica registro inexistente", () => {
    expect(translatePgError({ code: "PGRST116", message: "no rows" }).message).toMatch(/no existe/i);
  });
});

describe("translatePgError — nivel 3: texto libre y fallback", () => {
  it("errores de red se traducen aunque no traigan código", () => {
    expect(translatePgError(new Error("Failed to fetch")).message).toMatch(/sin conexión/i);
  });

  it("sin coincidencias devuelve matched=false y el mensaje crudo", () => {
    const r = translatePgError(new Error("Some other DB error"), "Error al guardar");
    expect(r.matched).toBe(false);
    expect(r.title).toBe("Error al guardar");
    expect(r.message).toBe("Some other DB error");
  });

  it("null devuelve el mensaje genérico", () => {
    expect(translatePgError(null).message).toBe("Ocurrió un error inesperado.");
  });
});

describe("getErrorMessage sigue delegando al catálogo", () => {
  it("mantiene compatibilidad con los mensajes previos", () => {
    expect(getErrorMessage(new Error("duplicate key value"))).toBe("Ya existe un registro con esos datos.");
    expect(getErrorMessage(new Error("drivers_name_unique"))).toMatch(/operador/i);
    expect(getErrorMessage(new Error("LAST_ADMIN_CANNOT_BE_DELETED"))).toMatch(/último administrador/i);
  });
});
