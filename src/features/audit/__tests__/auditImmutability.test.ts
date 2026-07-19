import { describe, expect, it } from "vitest";

/**
 * BL-39 — Modelo TypeScript del RPC `revert_audit_log` post-parche.
 *
 * Invariantes:
 *  1. El log original NUNCA se borra.
 *  2. Se emite un nuevo log con `action = 'REVERT'` y
 *     `changed_fields.source_audit_log_id = <log original>`.
 *  3. El RPC devuelve el id del log compensatorio.
 *  4. Cualquier UPDATE/DELETE sobre `audit_logs` desde app roles falla
 *     (trigger `enforce_audit_logs_immutable`), salvo bandera
 *     `app.audit_maintenance = 'on'` (reservada a mantenimiento server-side).
 */

type Action = "INSERT" | "UPDATE" | "DELETE" | "REVERT";
type AuditLog = {
  id: string;
  user_id: string;
  table_name: string;
  record_id: string;
  action: Action;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: Record<string, unknown> | null;
};

const ALLOWED = new Set([
  "bookings", "invoices", "forklifts", "customers", "contracts",
  "payments", "deliveries", "maintenance_logs", "damage_records",
  "quotes", "return_inspections",
]);

function makeStore(seed: AuditLog[]) {
  const rows = new Map<string, AuditLog>();
  for (const r of seed) rows.set(r.id, r);
  let auditMaintenance = false;
  let idSeq = seed.length;

  return {
    rows,
    setMaintenance(v: boolean) { auditMaintenance = v; },
    // Simula trigger BEFORE UPDATE OR DELETE.
    mutate(_id: string, _op: "UPDATE" | "DELETE"): never | void {
      if (auditMaintenance) return;
      throw new Error("audit_logs is append-only");
    },
    insertRevert(sourceId: string, actor: string): string {
      const src = rows.get(sourceId);
      if (!src) throw new Error("Audit log not found");
      const id = `log-${++idSeq}`;
      rows.set(id, {
        id,
        user_id: actor,
        table_name: src.table_name,
        record_id: src.record_id,
        action: "REVERT",
        old_data: src.new_data,
        new_data: src.old_data,
        changed_fields: { source_audit_log_id: sourceId },
      });
      return id;
    },
  };
}

function revertAuditLog(
  store: ReturnType<typeof makeStore>,
  logId: string,
  actor: { id: string; isAdmin: boolean },
): string {
  if (!actor.isAdmin) throw new Error("Unauthorized");
  const src = store.rows.get(logId);
  if (!src) throw new Error("Audit log not found");
  if (!ALLOWED.has(src.table_name)) {
    throw new Error(`Table ${src.table_name} is not allowed for revert`);
  }
  return store.insertRevert(logId, actor.id);
}

describe("BL-39 — audit_logs append-only + reverso compensado", () => {
  const admin = { id: "u-admin", isAdmin: true };
  const baseLog: AuditLog = {
    id: "log-1",
    user_id: "u-other",
    table_name: "invoices",
    record_id: "inv-1",
    action: "UPDATE",
    old_data: { total: 100 },
    new_data: { total: 999 },
    changed_fields: { total: [100, 999] },
  };

  it("no borra el log original y genera entrada REVERT trazable", () => {
    const store = makeStore([baseLog]);
    const revertId = revertAuditLog(store, "log-1", admin);

    expect(store.rows.get("log-1")).toBeDefined(); // original vive
    const rev = store.rows.get(revertId)!;
    expect(rev.action).toBe("REVERT");
    expect(rev.changed_fields).toEqual({ source_audit_log_id: "log-1" });
    expect(rev.record_id).toBe("inv-1");
    expect(rev.user_id).toBe(admin.id);
  });

  it("intento de UPDATE/DELETE en audit_logs falla (trigger append-only)", () => {
    const store = makeStore([baseLog]);
    expect(() => store.mutate("log-1", "DELETE")).toThrow(/append-only/);
    expect(() => store.mutate("log-1", "UPDATE")).toThrow(/append-only/);
  });

  it("bandera app.audit_maintenance permite mantenimiento (retención futura)", () => {
    const store = makeStore([baseLog]);
    store.setMaintenance(true);
    expect(() => store.mutate("log-1", "DELETE")).not.toThrow();
  });

  it("no-admin no puede revertir", () => {
    const store = makeStore([baseLog]);
    expect(() => revertAuditLog(store, "log-1", { id: "u-x", isAdmin: false }))
      .toThrow(/Unauthorized/);
  });

  it("tabla fuera del whitelist es rechazada", () => {
    const store = makeStore([{ ...baseLog, id: "log-2", table_name: "profiles" }]);
    expect(() => revertAuditLog(store, "log-2", admin))
      .toThrow(/not allowed for revert/);
  });

  it("revertir dos veces deja tres logs: original + REVERT + REVERT-del-REVERT", () => {
    const store = makeStore([baseLog]);
    const r1 = revertAuditLog(store, "log-1", admin);
    const r2 = revertAuditLog(store, r1, admin);
    expect(store.rows.size).toBe(3);
    expect(store.rows.get("log-1")).toBeDefined();
    expect(store.rows.get(r1)?.action).toBe("REVERT");
    expect((store.rows.get(r2)?.changed_fields as { source_audit_log_id: string })
      .source_audit_log_id).toBe(r1);
  });
});
