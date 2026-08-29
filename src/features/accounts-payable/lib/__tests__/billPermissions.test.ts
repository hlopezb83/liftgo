import { describe, expect, it } from "vitest";
import { computeBillPermissions } from "../billPermissions";

const base = { status: "pending", approval_status: "pending", payments: [] as unknown[] };

describe("computeBillPermissions", () => {
  it("permite editar y eliminar una factura pendiente sin pagos", () => {
    const perms = computeBillPermissions(base);
    expect(perms.canEdit).toBe(true);
    expect(perms.canDelete).toBe(true);
    expect(perms.editBlock).toBeNull();
  });

  it("bloquea con explicación cuando hay pagos registrados", () => {
    const perms = computeBillPermissions({ ...base, payments: [{}] });
    expect(perms.canEdit).toBe(false);
    expect(perms.editBlock?.code).toBe("supplier_bill_has_payments");
    expect(perms.deleteBlock?.code).toBe("supplier_bill_has_payments");
    expect(perms.editBlockedReason).toBe(perms.editBlock?.reason);
  });

  it("distingue aprobada, rechazada, pagada y cancelada", () => {
    expect(computeBillPermissions({ ...base, approval_status: "approved" }).editBlock?.code)
      .toBe("supplier_bill_approved");
    expect(computeBillPermissions({ ...base, approval_status: "rejected" }).editBlock?.code)
      .toBe("supplier_bill_rejected");
    expect(computeBillPermissions({ ...base, status: "paid" }).editBlock?.code)
      .toBe("supplier_bill_paid");
    expect(computeBillPermissions({ ...base, status: "cancelled" }).editBlock?.code)
      .toBe("supplier_bill_cancelled");
  });

  it("sin factura no habilita ninguna acción", () => {
    const perms = computeBillPermissions(null);
    expect(perms.canEdit).toBe(false);
    expect(perms.canDelete).toBe(false);
  });
});
