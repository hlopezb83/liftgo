import { z } from "zod";
import { optionalEmail } from "@/lib/schemas/common";

export const STAGE_LABELS: Record<string, string> = {
  nuevo_prospecto: "Nuevo Prospecto",
  contactado: "Contactado",
  cotizacion_enviada: "Cotización Enviada",
  negociacion: "Negociación",
  cerrado_ganado: "Cerrado Ganado",
  cerrado_perdido: "Cerrado Perdido",
};

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
  stage: z.string().min(1),
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
  const parsedValue = parseFloat(dealValue) || 0;
  if (requiresDealValue && parsedValue <= 0) {
    return { value: parsedValue, error: "El valor del trato debe ser mayor a $0 para esta etapa" };
  }
  return { value: parsedValue, error: null };
}

