import { describe, expect, it } from "vitest";
import { BUSINESS_BLOCKS, describeBusinessBlock, resolveBusinessBlock } from "../businessBlocks";

const NEW_CODES = [
  "supplier_bill_pending_approval",
  "supplier_payment_rep_received",
  "payment_rep_stamped_locked",
  "portal_payment_fully_reported",
  "damage_not_repaired",
  "prospect_stage_not_negotiation",
  "quote_expired",
  "quote_already_converted",
] as const;

describe("catálogo de bloqueos (lote 3)", () => {
  it.each(NEW_CODES)("%s tiene jerarquía qué → por qué → qué sigue", (code) => {
    const block = describeBusinessBlock(code);
    expect(block.action.length).toBeGreaterThan(0);
    expect(block.reason.length).toBeGreaterThan(0);
    expect(block.nextStep.length).toBeGreaterThan(0);
    expect(["info", "warning"]).toContain(block.tone);
  });

  it("no expone jerga técnica (SQLSTATE, triggers, constraints)", () => {
    for (const copy of Object.values(BUSINESS_BLOCKS)) {
      const text = `${copy.action} ${copy.reason} ${copy.nextStep}`;
      expect(text).not.toMatch(/SQLSTATE|constraint|trigger|_fkey|P0001/i);
    }
  });

  it("reconoce la carrera del cierre de prospecto fuera de negociación", () => {
    const block = resolveBusinessBlock(
      new Error("Sólo se puede cerrar un deal en etapa Negociación"),
    );
    expect(block?.code).toBe("prospect_stage_not_negotiation");
  });
});
