import { describe, expect, it } from "vitest";
import { readAuditLogFilters } from "../queryKeys";

describe("readAuditLogFilters (v7.364.0)", () => {
  it("oculta los registros de prueba por defecto", () => {
    expect(readAuditLogFilters(undefined).origin).toBe("default");
    expect(readAuditLogFilters({}).origin).toBe("default");
  });

  it("respeta un origen válido", () => {
    expect(readAuditLogFilters({ origin: "e2e" }).origin).toBe("e2e");
    expect(readAuditLogFilters({ origin: "system" }).origin).toBe("system");
    expect(readAuditLogFilters({ origin: "all" }).origin).toBe("all");
  });

  it("ignora orígenes desconocidos", () => {
    expect(readAuditLogFilters({ origin: "hackeado" }).origin).toBe("default");
  });

  it("conserva los filtros de tabla y registro", () => {
    const filters = readAuditLogFilters({ table_name: "invoices", record_id: "abc", origin: "user" });
    expect(filters).toEqual({ table_name: "invoices", record_id: "abc", origin: "user" });
  });
});
