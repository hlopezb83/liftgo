import { useEffect, useState } from "react";
import { useQuotes } from "@/features/quotes";
import {
  STAGES_REQUIRING_DEAL_VALUE,
  prospectPayloadSchema,
  sortQuotesByCompanyMatch,
  validateDealValue,
  type ProspectFormPayload,
} from "../lib/prospectFormSchema";
import type { Prospect } from "./useProspects";

export { STAGE_LABELS, STAGES_REQUIRING_DEAL_VALUE } from "../lib/prospectFormSchema";
export type { ProspectFormPayload } from "../lib/prospectFormSchema";

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

  const matchingQuotes = sortQuotesByCompanyMatch(allQuotes, company);

  const effectiveStage = overrideStage ?? prospect?.stage ?? defaultStage;
  const requiresDealValue = STAGES_REQUIRING_DEAL_VALUE.includes(effectiveStage);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- rehidrata múltiples campos desde
       props (prospect) al abrir el modal; el prev-prop guard supera el umbral de complejidad. */
    if (prospect) {
      setCompany(prospect.companyName);
      setContact(prospect.contactPerson ?? "");
      setEmail(prospect.email ?? "");
      setPhone(prospect.phone ?? "");
      setDealValue(String(prospect.dealValue ?? 0));
      setNotes(prospect.notes ?? "");
      setQuoteId(prospect.quoteId ?? null);
    } else {
      setCompany(""); setContact(""); setEmail(""); setPhone("");
      setDealValue(""); setNotes(""); setQuoteId(null);
    }
    setDealValueError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
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
    const { value, error } = validateDealValue(dealValue, requiresDealValue);
    if (error) {
      setDealValueError(error);
      return null;
    }
    // v7.217.0 (C9): validación Zod en la frontera. Detecta email inválido,
    // longitudes fuera de rango y quote_id mal formado antes del mutation.
    const parsed = prospectPayloadSchema.safeParse({
      company_name: company,
      contact_person: contact,
      email,
      phone,
      deal_value: value,
      notes,
      stage: effectiveStage,
      quote_id: quoteId,
    });
    if (!parsed.success) {
      const emailIssue = parsed.error.issues.find((i) => i.path[0] === "email");
      if (emailIssue) setDealValueError(null);
      // Reutilizamos dealValueError como canal de mensaje ligero; el resto
      // se reporta vía notifyValidation para no acoplar el hook a la UI.
      const first = parsed.error.issues[0];
      setDealValueError(first?.message ?? "Datos inválidos");
      return null;
    }
    return parsed.data;
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
