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

export interface ProspectFormPayload {
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  deal_value: number;
  notes: string;
  stage: string;
  quote_id: string | null;
}

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
