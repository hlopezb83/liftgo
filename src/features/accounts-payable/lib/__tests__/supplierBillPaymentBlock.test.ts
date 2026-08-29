import { describe, expect, it } from "vitest";
import { supplierBillPaymentBlock } from "../billPermissions";

describe("supplierBillPaymentBlock", () => {
  const base = { status: "pending", approval_status: "approved", payments: [] };

  it("permite el pago cuando la factura está aprobada y abierta", () => {
    expect(supplierBillPaymentBlock(base)).toBeNull();
  });

  it("explica los estados que ya bloqueaban el pago", () => {
    expect(supplierBillPaymentBlock({ ...base, status: "paid" })?.code).toBe("supplier_bill_paid");
    expect(supplierBillPaymentBlock({ ...base, status: "cancelled" })?.code).toBe("supplier_bill_cancelled");
    expect(supplierBillPaymentBlock({ ...base, approval_status: "pending" })?.code)
      .toBe("supplier_bill_pending_approval");
    expect(supplierBillPaymentBlock({ ...base, approval_status: "rejected" })?.code)
      .toBe("supplier_bill_rejected");
  });
});
