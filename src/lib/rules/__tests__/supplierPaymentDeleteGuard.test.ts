import { describe, it, expect } from "vitest";
import { resolveBusinessBlock } from "../businessBlocks";

/**
 * Contrato de error del guard de la BD
 * (`trg_guard_supplier_payment_delete` / `guard_supplier_payment_delete`):
 * el rechazo debe llegar a la UI como bloqueo explicable, no como toast técnico.
 */
describe("guard de borrado de pago a proveedor (P0)", () => {
  it("mapea el rechazo por REP fiscal recibido", () => {
    const err = Object.assign(new Error("x"), {
      code: "P0001",
      message: "No puedes eliminar este pago: ya se registró el REP fiscal recibido del proveedor",
    });
    expect(resolveBusinessBlock(err)?.code).toBe("supplier_payment_rep_received");
  });

  it("mapea el rechazo por factura de proveedor cancelada", () => {
    const err = Object.assign(new Error("x"), {
      code: "P0001",
      message: "No puedes eliminar este pago: la factura de proveedor está cancelada",
    });
    expect(resolveBusinessBlock(err)?.code).toBe("supplier_bill_cancelled");
  });

  it("no expone texto SQL en la copia mostrada al usuario", () => {
    const block = resolveBusinessBlock(
      Object.assign(new Error("x"), {
        code: "P0001",
        message: "No puedes eliminar este pago: ya se registró el REP fiscal recibido del proveedor",
      }),
    );
    const text = `${block?.action} ${block?.reason} ${block?.nextStep}`;
    expect(text).not.toMatch(/P0001|trigger|supplier_payments|rep_status/i);
  });

  it("el rechazo por permisos NO se disfraza de bloqueo de negocio", () => {
    const err = Object.assign(new Error("x"), {
      code: "42501",
      message: "Solo un administrador puede eliminar un pago a proveedor",
    });
    expect(resolveBusinessBlock(err)).toBeNull();
  });
});
