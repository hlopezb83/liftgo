import { useState } from "react";
import {
  STAGES_REQUIRING_DEAL_VALUE,
  prospectPayloadSchema,
  validateDealValue,
  type ProspectFormPayload,
} from "../lib/prospectFormSchema";
import { quoteDealValueMxn } from "../lib/quoteDealValue";
import { useProspectQuoteSelection } from "./useProspectQuoteSelection";
import type { Prospect } from "./useProspects";

export { STAGE_LABELS } from "../lib/constants";
export type { ProspectFormPayload } from "../lib/prospectFormSchema";

interface UseProspectFormParams {
  prospect: Prospect | null | undefined;
  open: boolean;
  defaultStage: string;
  overrideStage?: string;
}

interface ProspectFormSnapshot {
  company: string;
  contact: string;
  email: string;
  phone: string;
  dealValue: string;
  notes: string;
  quoteId: string | null;
}

interface ProspectFormErrors {
  dealValueError: string | null;
  emailError: string | null;
  companyError: string | null;
  contactError: string | null;
  phoneError: string | null;
  notesError: string | null;
  formError: string | null;
}

interface ProspectFormState {
  values: ProspectFormSnapshot;
  errors: ProspectFormErrors;
  quoteSearch: string;
}

const EMPTY_ERRORS: ProspectFormErrors = {
  dealValueError: null,
  emailError: null,
  companyError: null,
  contactError: null,
  phoneError: null,
  notesError: null,
  formError: null,
};

function buildInitialValues(prospect: Prospect | null | undefined): ProspectFormSnapshot {
  return {
    company: prospect?.companyName ?? "",
    contact: prospect?.contactPerson ?? "",
    email: prospect?.email ?? "",
    phone: prospect?.phone ?? "",
    dealValue: prospect ? String(prospect.dealValue ?? 0) : "",
    notes: prospect?.notes ?? "",
    quoteId: prospect?.quoteId ?? null,
  };
}

function createInitialState(prospect: Prospect | null | undefined): ProspectFormState {
  return {
    values: buildInitialValues(prospect),
    errors: EMPTY_ERRORS,
    quoteSearch: "",
  };
}

function isProspectFormDirty(
  prospect: Prospect | null | undefined,
  s: ProspectFormSnapshot,
): boolean {
  const initial = buildInitialValues(prospect);
  const keys = Object.keys(initial) as Array<keyof ProspectFormSnapshot>;
  return keys.some((k) => s[k] !== initial[k]);
}

export function useProspectForm({
  prospect, open, overrideStage,
}: UseProspectFormParams) {
  const sessionKey = `${prospect?.id ?? "new"}:${open}`;
  const [prevSessionKey, setPrevSessionKey] = useState(sessionKey);
  const [state, setState] = useState<ProspectFormState>(() => createInitialState(prospect));

  if (prevSessionKey !== sessionKey) {
    setPrevSessionKey(sessionKey);
    setState(createInitialState(prospect));
  }

  const { values, errors, quoteSearch } = state;
  const setField = <K extends keyof ProspectFormSnapshot>(
    key: K,
    value: ProspectFormSnapshot[K],
    errorKey?: keyof ProspectFormErrors,
  ) => {
    setState((prev) => ({
      ...prev,
      values: { ...prev.values, [key]: value },
      errors: errorKey ? { ...prev.errors, [errorKey]: null } : prev.errors,
    }));
  };

  const quoteData = useProspectQuoteSelection({
    quoteId: values.quoteId,
    company: values.company,
    quoteSearch,
    open,
    onSearchChange: (q) => setState((prev) => ({ ...prev, quoteSearch: q })),
  });

  const effectiveStage = prospect ? (overrideStage ?? prospect.stage) : "nuevo_prospecto";
  const requiresDealValue = STAGES_REQUIRING_DEAL_VALUE.includes(effectiveStage);

  const handleQuoteChange = (value: string) => {
    const selectedId = value === "none" ? null : value;
    const matched = selectedId ? quoteData.matchingQuotes.find((q) => q.id === selectedId) : undefined;
    const converted = matched ? quoteDealValueMxn(matched) : null;
    setState((prev) => ({
      ...prev,
      values: {
        ...prev.values,
        quoteId: selectedId,
        dealValue: converted ? (converted.value === null ? "" : String(converted.value)) : prev.values.dealValue,
      },
      errors: {
        ...prev.errors,
        formError: null,
        dealValueError: selectedId ? (converted ? converted.error : prev.errors.dealValueError) : null,
      },
    }));
  };

  const buildPayload = (): ProspectFormPayload | null => {
    if (quoteData.linkedQuoteError) {
      setState((prev) => ({ ...prev, errors: { ...prev.errors, formError: quoteData.linkedQuoteError } }));
      return null;
    }
    const quoteError = quoteData.selectedQuote ? quoteDealValueMxn(quoteData.selectedQuote).error : null;
    if (quoteError) {
      setState((prev) => ({ ...prev, errors: { ...prev.errors, dealValueError: quoteError } }));
      return null;
    }
    const { value, error } = validateDealValue(values.dealValue, requiresDealValue);
    if (error) {
      setState((prev) => ({ ...prev, errors: { ...prev.errors, dealValueError: error } }));
      return null;
    }
    const parsed = prospectPayloadSchema.safeParse({
      company_name: values.company,
      contact_person: values.contact,
      email: values.email,
      phone: values.phone,
      deal_value: value,
      notes: values.notes,
      stage: effectiveStage,
      quote_id: values.quoteId,
    });
    if (!parsed.success) {
      const errorFor = (field: string) => parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null;
      setState((prev) => ({
        ...prev,
        errors: {
          companyError: errorFor("company_name"),
          emailError: errorFor("email"),
          dealValueError: errorFor("deal_value"),
          contactError: errorFor("contact_person"),
          phoneError: errorFor("phone"),
          notesError: errorFor("notes"),
          formError: errorFor("stage") ?? errorFor("quote_id"),
        },
      }));
      return null;
    }
    setState((prev) => ({ ...prev, errors: EMPTY_ERRORS }));
    return parsed.data;
  };

  return {
    isDirty: isProspectFormDirty(prospect, values),
    fields: { ...values, ...errors },
    setters: {
      setCompany: (v: string) => setField("company", v, "companyError"),
      setContact: (v: string) => setField("contact", v, "contactError"),
      setEmail: (v: string) => setField("email", v, "emailError"),
      setPhone: (v: string) => setField("phone", v, "phoneError"),
      setDealValue: (v: string) => setField("dealValue", v, "dealValueError"),
      setNotes: (v: string) => setField("notes", v, "notesError"),
      handleQuoteChange,
    },
    matchingQuotes: quoteData.matchingQuotes,
    selectedQuote: quoteData.selectedQuote,
    quoteSelection: quoteData.quoteSelection,
    effectiveStage,
    requiresDealValue,
    buildPayload,
  };
}
