import { useEffect, useMemo, useState } from "react";
import { useQuotes } from "@/features/quotes/hooks/quotes/useQuotes";
import type { Prospect } from "@/hooks/useProspects";

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

interface UseProspectFormParams {
  prospect: Prospect | null | undefined;
  open: boolean;
  defaultStage: string;
  overrideStage?: string;
}

export function useProspectForm({
  prospect, open, defaultStage, overrideStage,
}: UseProspectFormParams) {
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [notes, setNotes] = useState("");
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [dealValueError, setDealValueError] = useState<string | null>(null);

  const { data: allQuotes = [] } = useQuotes();

  const matchingQuotes = useMemo(() => {
    if (!company.trim()) return allQuotes;
    const lowerCompany = company.toLowerCase();
    const matches = (name: string | null | undefined): boolean => {
      const n = name?.toLowerCase() ?? "";
      return n.includes(lowerCompany) || lowerCompany.includes(n);
    };
    return [...allQuotes].sort((a, b) => Number(matches(b.customer_name)) - Number(matches(a.customer_name)));
  }, [allQuotes, company]);

  const effectiveStage = overrideStage ?? prospect?.stage ?? defaultStage;
  const requiresDealValue = STAGES_REQUIRING_DEAL_VALUE.includes(effectiveStage);

  useEffect(() => {
    if (prospect) {
      setCompany(prospect.company_name);
      setContact(prospect.contact_person ?? "");
      setEmail(prospect.email ?? "");
      setPhone(prospect.phone ?? "");
      setDealValue(String(prospect.deal_value ?? 0));
      setNotes(prospect.notes ?? "");
      setQuoteId(prospect.quote_id ?? null);
    } else {
      setCompany(""); setContact(""); setEmail(""); setPhone("");
      setDealValue(""); setNotes(""); setQuoteId(null);
    }
    setDealValueError(null);
  }, [prospect, open]);

  const handleQuoteChange = (value: string) => {
    const selectedId = value === "none" ? null : value;
    setQuoteId(selectedId);
    if (selectedId) {
      const quote = allQuotes.find((q) => q.id === selectedId);
      if (quote) {
        setDealValue(String(quote.total ?? 0));
        setDealValueError(null);
      }
    }
  };

  const buildPayload = (): ProspectFormPayload | null => {
    const parsedValue = parseFloat(dealValue) || 0;
    if (requiresDealValue && parsedValue <= 0) {
      setDealValueError("El valor del trato debe ser mayor a $0 para esta etapa");
      return null;
    }
    return {
      company_name: company,
      contact_person: contact,
      email, phone,
      deal_value: parsedValue,
      notes,
      stage: effectiveStage,
      quote_id: quoteId,
    };
  };

  const selectedQuote = quoteId ? allQuotes.find((q) => q.id === quoteId) : null;

  return {
    fields: { company, contact, email, phone, dealValue, notes, quoteId, dealValueError },
    setters: {
      setCompany, setContact, setEmail, setPhone,
      setDealValue: (v: string) => { setDealValue(v); setDealValueError(null); },
      setNotes,
      handleQuoteChange,
    },
    matchingQuotes,
    selectedQuote,
    effectiveStage,
    requiresDealValue,
    buildPayload,
  };
}
