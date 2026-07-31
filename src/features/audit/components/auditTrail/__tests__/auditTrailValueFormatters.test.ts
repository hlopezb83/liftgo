import { describe, it, expect } from "vitest";
import { formatAuditValue, getRecordLabel } from "../auditTrailValueFormatters";
import type { AuditLog } from "../../../hooks/useAuditLogs";

function log(over: Partial<AuditLog> = {}): AuditLog {
  return {
    id: "log-1",
    table_name: "profiles",
    record_id: "11111111-2222-3333-4444-555555555555",
    action: "UPDATE",
    changed_fields: null,
    user_id: "u-1",
    created_at: "2026-06-01T12:00:00Z",
    ...over,
  };
}

describe("auditTrailValueFormatters", () => {
  it("BL-R8-16 · traduce el campo role a su etiqueta en español", () => {
    expect(formatAuditValue("role", "administrativo")).toBe("Administrativo");
    expect(formatAuditValue("role", "ventas")).toBe("Ventas");
  });

  it("BL-R8-16 · getRecordLabel usa full_name cuando no hay name", () => {
    const l = log({ new_data: { full_name: "Juana Pérez", role: "ventas" } });
    expect(getRecordLabel(l)).toBe("Juana Pérez");
  });

  it("BL-R8-16 · getRecordLabel cae a 'tabla traducida + UUID corto' en vez del UUID crudo", () => {
    const l = log({ new_data: { avatar_url: "https://example.com/a.png" } });
    expect(getRecordLabel(l)).toBe(`Perfiles de Usuario ${l.record_id.slice(0, 8)}`);
  });

  it("getRecordLabel respeta label pre-computado si existe", () => {
    const l = log({ label: "Ya calculado" });
    expect(getRecordLabel(l)).toBe("Ya calculado");
  });
});
