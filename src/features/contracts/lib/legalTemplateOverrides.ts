export interface LegalTemplateOverrides {
  city: string;
  jurisdiction: string;
  legal_representative: string;
  witness_1: string;
  witness_2: string;
}

export const EMPTY_LEGAL_TEMPLATE_OVERRIDES: LegalTemplateOverrides = {
  city: "",
  jurisdiction: "",
  legal_representative: "",
  witness_1: "",
  witness_2: "",
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeLegalTemplateOverrides(value: unknown): LegalTemplateOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_LEGAL_TEMPLATE_OVERRIDES };
  }
  const row = value as Record<string, unknown>;
  return {
    city: asText(row.city),
    jurisdiction: asText(row.jurisdiction),
    legal_representative: asText(row.legal_representative),
    witness_1: asText(row.witness_1),
    witness_2: asText(row.witness_2),
  };
}

