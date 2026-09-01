import { describe, it, expect } from "vitest";
import { resolveBusinessBlock } from "../businessBlocks";

/**
 * Contrato de error de la RPC `delete_booking`: rechazar una reserva que no
 * está cancelada/completada debe llegar a la UI como bloqueo explicable
 * ("cancela primero"), no como reporte de error genérico.
 */
describe("guard de eliminación de reserva", () => {
  it("mapea el rechazo por reserva confirmada", () => {
    const err = Object.assign(new Error("x"), {
      code: "P0001",
      message:
        "Solo se pueden eliminar reservas canceladas o completadas (estado actual: confirmed). Usa cancelar primero.",
    });
    const block = resolveBusinessBlock(err);
    expect(block?.code).toBe("booking_not_final_for_delete");
    expect(block?.nextStep).toMatch(/cancelar/i);
  });

  it("no expone texto SQL en la copia mostrada al usuario", () => {
    const block = resolveBusinessBlock(
      Object.assign(new Error("x"), {
        code: "P0001",
        message: "Solo se pueden eliminar reservas canceladas o completadas",
      }),
    );
    const text = `${block?.action} ${block?.reason} ${block?.nextStep}`;
    expect(text).not.toMatch(/P0001|trigger|delete_booking|rpc/i);
  });
});
