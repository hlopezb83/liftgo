import type { LegalTemplateContent } from "@/lib/platformLegalTemplates.types";

export function legalTemplateSections(content: LegalTemplateContent) {
  return [
    { label: "Introducción", text: content.intro_text ?? "" },
    { label: "Texto general", text: content.body_text ?? "" },
    { label: "Declaraciones del arrendador", text: content.declarations_landlord.map((text, i) => `${i + 1}. ${text}`).join("\n\n") },
    { label: "Declaraciones del arrendatario", text: content.declarations_tenant.map((text, i) => `${i + 1}. ${text}`).join("\n\n") },
    { label: "Cláusulas", text: content.clauses.map((clause, i) => `${i + 1}. ${clause.title}\n${clause.body}`).join("\n\n") },
    { label: "Checklist de entrega", text: content.checklist_sections.map((section) => `${section.title}\n${section.items.map((item) => `• ${item}`).join("\n")}`).join("\n\n") },
    { label: "Pagaré", text: content.pagare_text ?? "" },
  ];
}

export function legalTemplateDifferences(before: LegalTemplateContent, after: LegalTemplateContent) {
  const previous = legalTemplateSections(before);
  return legalTemplateSections(after).flatMap((section, i) => {
    const old = previous[i]?.text ?? "";
    return old === section.text ? [] : [{ label: section.label, before: old, after: section.text }];
  });
}
