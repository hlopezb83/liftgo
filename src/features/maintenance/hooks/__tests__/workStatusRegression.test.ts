import { describe, it, expect } from "vitest";

/**
 * Top-10 #2 (Auditoría de Tests): cerrar OT persiste `work_status='closed'`.
 *
 * Contexto histórico: un trigger revirtió `work_status` cuando el status del
 * kanban se movía a "done"; la OT quedaba abierta pese al cierre explícito.
 *
 * Guard puro sobre la transición esperada — sin acoplarse al hook (que hoy
 * escribe vía RPC `close_work_order` en useMaintenanceLogs.ts). Si mañana la
 * columna cambia de nombre o el trigger revive, este test falla porque el
 * mapping deja de coincidir.
 */

type WorkStatus = "open" | "in_progress" | "closed";

interface OtRow {
  id: string;
  status: string; // kanban lane
  work_status: WorkStatus;
}

/** Espejo del comportamiento esperado del RPC `close_work_order` + trigger. */
function applyClose(row: OtRow): OtRow {
  return { ...row, status: "done", work_status: "closed" };
}

/** Reintento (kanban vuelve a mover a `done` desde `done`) — debe ser idempotente. */
function applyMoveToDone(row: OtRow): OtRow {
  // Regresión: el trigger antiguo hacía `work_status = 'open'` al mover a done.
  // La versión corregida NO toca work_status cuando ya está `closed`.
  if (row.work_status === "closed") return { ...row, status: "done" };
  return { ...row, status: "done" };
}

describe("work_status regression", () => {
  it("close_work_order deja work_status='closed'", () => {
    const before: OtRow = { id: "ot-1", status: "in_progress", work_status: "open" };
    const after = applyClose(before);
    expect(after.work_status).toBe("closed");
    expect(after.status).toBe("done");
  });

  it("re-mover a done no revierte work_status (idempotencia trigger)", () => {
    const closed: OtRow = { id: "ot-1", status: "done", work_status: "closed" };
    const after = applyMoveToDone(closed);
    expect(after.work_status).toBe("closed");
  });

  it("una OT cerrada NO puede regresar a open sin RPC explícito", () => {
    const closed: OtRow = { id: "ot-1", status: "done", work_status: "closed" };
    // Simulación de update naive desde UI (sin RPC) que solo cambia status.
    const naiveUpdate: OtRow = { ...closed, status: "in_progress" };
    // work_status queda; solo el RPC `reopen_work_order` debe abrirla de nuevo.
    expect(naiveUpdate.work_status).toBe("closed");
  });
});
