import { z } from "zod";
import { STAGE_LABELS } from "@/features/crm/lib/constants";
import { optionalEmail } from "@/lib/schemas/common";

export const STAGES_REQUIRING_DEAL_VALUE = [
  "cotizacion_enviada",
  "negociacion",
  "cerrado_ganado",
  "cerrado_perdido",
];

// v7.217.0 (C9): Zod schema en la frontera del formulario. Valida email real,
// longitudes y forma del payload antes de llegar al mutation.
export const prospectPayloadSchema = z.object({
  company_name: z.string().trim().min(1, "El nombre de la empresa es requerido").max(200),
  contact_person: z.string().trim().max(150).default(""),
  email: optionalEmail(),
  phone: z.string().trim().max(30).default(""),
  deal_value: z.number().min(0, "El valor del trato debe ser positivo"),
  notes: z.string().max(2000).default(""),
  stage: z.string().refine(
    (s) => s in STAGE_LABELS,
    "Etapa inválida: usa una de las etapas del pipeline",
  ),
  quote_id: z.string().uuid().nullable(),
});

export type ProspectFormPayload = z.infer<typeof prospectPayloadSchema>;

interface QuoteLike {
  id: string;
  customer_name?: string | null;
}

export function sortQuotesByCompanyMatch<Q extends QuoteLike>(allQuotes: Q[], company: string): Q[] {
  if (!company.trim()) return allQuotes;
  const lowerCompany = company.toLowerCase();
  const matches = (name: string | null | undefined): boolean => {
    const n = name?.toLowerCase() ?? "";
    return n.includes(lowerCompany) || lowerCompany.includes(n);
  };
  return [...allQuotes].sort(
    (a, b) => Number(matches(b.customer_name)) - Number(matches(a.customer_name)),
  );
}

export function validateDealValue(
  dealValue: string,
  requiresDealValue: boolean,
): { value: number; error: string | null } {
  const trimmed = dealValue.trim();
  // FIX-FE-10: parseFloat tragaba prefijos ("12x3" → 12, "abc" → 0 silencioso).
  // Number() es estricto: cualquier entrada no vacía no numérica se rechaza.
  const parsedValue = trimmed === "" ? 0 : Number(trimmed);
  if (trimmed !== "" && !Number.isFinite(parsedValue)) {
    return { value: 0, error: "Ingresa un monto numérico válido" };
  }
  if (requiresDealValue && parsedValue <= 0) {
    return { value: parsedValue, error: "El valor del trato debe ser mayor a $0 para esta etapa" };
  }
  return { value: parsedValue, error: null };
}

