import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const state = { role: "ventas", access: "none" };
const logs = [
  {
    id: "log-1",
    table_name: "prospects",
    record_id: "p-1",
    action: "UPDATE",
    changed_fields: ["stage"],
    old_data: { stage: "new" },
    new_data: { stage: "qualified" },
    user_id: "u-1",
    created_at: "2026-02-01T10:00:00Z",
  },
];

vi.mock("@/features/users", () => ({
  getAccessLevel: () => state.access,
  useUserRole: () => ({ data: state.role, isLoading: false, isError: false }),
  useRolePermissions: () => ({ data: {}, isLoading: false, isError: false }),
}));

vi.mock("@/features/audit", () => ({
  useAuditLogs: () => ({ data: logs, isLoading: false }),
  AuditLogDetailDialog: () => null,
  HIDDEN_DIFF_FIELDS: new Set<string>(),
  formatAuditValue: (_f: string, v: unknown) => String(v),
  formatTimestamp: () => "01/02/2026 10:00",
  translateAction: () => "Actualizó",
  translateField: (f: string) => f,
}));

import { ProspectHistoryCard } from "../ProspectHistoryCard";

describe("ProspectHistoryCard — gate de historial (R9-03)", () => {
  beforeEach(() => {
    state.role = "ventas";
    state.access = "none";
  });

  it("Ventas ve el historial aunque no tenga el módulo Auditoría", () => {
    render(<ProspectHistoryCard prospectId="p-1" />);
    expect(screen.queryByText(/No tienes permiso/i)).toBeNull();
    expect(screen.getByText(/stage:/)).toBeInTheDocument();
  });

  it("Admin ve el historial por acceso al módulo Auditoría", () => {
    state.role = "admin";
    state.access = "full";
    render(<ProspectHistoryCard prospectId="p-1" />);
    expect(screen.queryByText(/No tienes permiso/i)).toBeNull();
  });

  it("un rol sin acceso ni excepción ve el mensaje de permiso, no 'sin cambios'", () => {
    state.role = "mecanico";
    state.access = "none";
    render(<ProspectHistoryCard prospectId="p-1" />);
    expect(screen.getByText(/No tienes permiso/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sin cambios registrados/i)).toBeNull();
  });
});
