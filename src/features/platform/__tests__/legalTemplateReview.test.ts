import { describe, expect, it } from "vitest";
import type { LegalTemplateContent } from "@/lib/platformLegalTemplates.types";
import { legalTemplateDifferences, legalTemplateSections } from "../lib/legalTemplateReview";
const before: LegalTemplateContent = { intro_text: "Contrato {{folio}}", body_text: null, declarations_landlord: ["Representación"],
  declarations_tenant: ["Domicilio"], clauses: [{ title: "Renta", body: "Pago mensual" }],
  checklist_sections: [{ title: "Entrega", items: ["Horómetro"] }], pagare_text: "Pagaré" };
describe("revisión legible de machotes", () => {
  it("conserva cláusulas, checklist y variables sin resolver datos de una empresa", () => {
    const text = legalTemplateSections(before).map((section) => section.text).join("\n");
    expect(text).toContain("{{folio}}"); expect(text).toContain("Renta\nPago mensual"); expect(text).toContain("Entrega\n• Horómetro");
  });
  it("compara cambios por sección, incluyendo borrados, sin alterar el original", () => {
    const after = { ...before, intro_text: null, clauses: [{ title: "Renta", body: "Pago anticipado" }] };
    expect(legalTemplateDifferences(before, after)).toEqual([
      { label: "Introducción", before: "Contrato {{folio}}", after: "" },
      { label: "Cláusulas", before: "1. Renta\nPago mensual", after: "1. Renta\nPago anticipado" },
    ]);
    expect(before.intro_text).toBe("Contrato {{folio}}"); expect(legalTemplateDifferences(before, { ...before })).toEqual([]);
  });
});
