import { useEffect, useMemo, useState } from "react";
import { useQuotes } from "@/features/quotes/hooks/quotes/useQuotes";
import type { Prospect } from "@/features/crm/hooks/useProspects";
import {
  STAGES_REQUIRING_DEAL_VALUE,
  sortQuotesByCompanyMatch,
  validateDealValue,
  type ProspectFormPayload,
} from "@/features/crm/lib/prospectFormSchema";

export { STAGE_LABELS, STAGES_REQUIRING_DEAL_VALUE } from "@/features/crm/lib/prospectFormSchema";
export type { ProspectFormPayload } from "@/features/crm/lib/prospectFormSchema";

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

  const matchingQuotes = useMemo(
    () => sortQuotesByCompanyMatch(allQuotes, company),
    [allQuotes, company],
  );

  const effectiveStage = overrideStage ?? prospect?.stage ?? defaultStage;
  const requiresDealValue = STAGES_REQUIRING_DEAL_VALUE.includes(effectiveStage);

  useEffect(() => {
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
    return {
      company_name: company,
      contact_person: contact,
      email, phone,
      deal_value: value,
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
