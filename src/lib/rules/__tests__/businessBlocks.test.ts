import { describe, expect, it } from "vitest";
import {
  BUSINESS_BLOCKS,
  describeForkliftRentalBlock,
  businessBlockSummary,
  describeBusinessBlock,
  resolveBusinessBlock,
} from "../businessBlocks";

describe("businessBlocks", () => {
  it("cada bloqueo declara acción, motivo y siguiente paso en español", () => {
    for (const [code, copy] of Object.entries(BUSINESS_BLOCKS)) {
      expect(copy.action, code).toMatch(/\S/);
      expect(copy.reason, code).toMatch(/\S/);
      expect(copy.nextStep, code).toMatch(/\S/);
      expect(["info", "warning"]).toContain(copy.tone);
    }
  });

  it("describeBusinessBlock permite overrides contextuales", () => {
    const block = describeBusinessBlock("forklift_active_rental", { reason: "Renta LG-100 activa." });
    expect(block.code).toBe("forklift_active_rental");
    expect(block.reason).toBe("Renta LG-100 activa.");
    expect(block.action).toBe(BUSINESS_BLOCKS.forklift_active_rental.action);
  });

  it("businessBlockSummary une motivo y siguiente paso", () => {
    const summary = businessBlockSummary(describeBusinessBlock("maintenance_open_damage"));
    expect(summary).toContain("daño abierto");
    expect(summary).toContain("reparado");
  });

  it("reconoce el rechazo del backend por renta activa", () => {
    const err = new Error("La unidad tiene una renta activa; completa la devolución antes de venderla");
    expect(resolveBusinessBlock(err)?.code).toBe("forklift_active_rental");
  });

  it("reconoce la restricción de extensión ya facturada", () => {
    const err = Object.assign(new Error("duplicate key"), {
      code: "23505",
      message: 'duplicate key value violates unique constraint "booking_extensions_invoice_id_uniq"',
    });
    expect(resolveBusinessBlock(err)?.code).toBe("extension_already_billed");
  });

  it("devuelve null para errores que no son reglas de negocio catalogadas", () => {
    expect(resolveBusinessBlock(new Error("network timeout"))).toBeNull();
    expect(resolveBusinessBlock(null)).toBeNull();
  });

  it("nunca expone SQLSTATE ni nombres de restricción en la copia", () => {
    for (const copy of Object.values(BUSINESS_BLOCKS)) {
      const text = `${copy.action} ${copy.reason} ${copy.nextStep}`;
      expect(text).not.toMatch(/\b\d{5}\b|constraint|_id_|violates/i);
    }
  });

  it("el bloqueo de renta activa nombra la acción según el estado destino", () => {
    expect(describeForkliftRentalBlock("sold").action).toContain("vender");
    expect(describeForkliftRentalBlock("retired").action).toContain("dar de baja");
    expect(describeForkliftRentalBlock("maintenance").action).toContain("mantenimiento");
    expect(describeForkliftRentalBlock("available").action).toContain("disponible");
    // Motivo y siguiente paso son los mismos: una sola regla canónica.
    expect(describeForkliftRentalBlock("sold").reason).toBe(
      BUSINESS_BLOCKS.forklift_active_rental.reason,
    );
    // Estado desconocido → copia canónica sin override.
    expect(describeForkliftRentalBlock("otro").action).toBe(
      BUSINESS_BLOCKS.forklift_active_rental.action,
    );
  });
});
