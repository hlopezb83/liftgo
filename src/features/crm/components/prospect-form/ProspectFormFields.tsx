import { RequiredMark } from "@/components/forms/RequiredMark";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProspectQuoteSelector } from "./ProspectQuoteSelector";
import type { useProspectForm } from "../../hooks/useProspectForm";

type FormState = ReturnType<typeof useProspectForm>;

interface Props {
  fields: FormState["fields"];
  setters: FormState["setters"];
  matchingQuotes: FormState["matchingQuotes"];
  selectedQuote: FormState["selectedQuote"];
  requiresDealValue: boolean;
}

function validationProps(message: string | null, id: string, helpId?: string) {
  return {
    "aria-invalid": !!message,
    "aria-describedby": [helpId, message ? id : undefined].filter(Boolean).join(" ") || undefined,
  };
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  return message ? <p id={id} role="alert" className="text-xs text-destructive">{message}</p> : null;
}

/**
 * Cuerpo del formulario de prospecto (campos básicos + valor + notas).
 * Se extrajo de ProspectFormDialog para reducir su complejidad ciclomática.
 */
export function ProspectFormFields({
  fields, setters, matchingQuotes, selectedQuote, requiresDealValue,
}: Props) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="company">Empresa <RequiredMark /></Label>
        <Input
          id="company"
          value={fields.company}
          onChange={(e) => setters.setCompany(e.target.value)}
          {...validationProps(fields.companyError, "prospect-company-error")}
        />
        <FieldError id="prospect-company-error" message={fields.companyError} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact">Persona de contacto</Label>
        <Input id="contact" value={fields.contact} onChange={(e) => setters.setContact(e.target.value)}
          {...validationProps(fields.contactError, "prospect-contact-error")} />
        <FieldError id="prospect-contact-error" message={fields.contactError} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input id="email" type="email" value={fields.email} onChange={(e) => setters.setEmail(e.target.value)}
            {...validationProps(fields.emailError, "prospect-email-error")} />
          <FieldError id="prospect-email-error" message={fields.emailError} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" value={fields.phone} onChange={(e) => setters.setPhone(e.target.value)}
            {...validationProps(fields.phoneError, "prospect-phone-error")} />
          <FieldError id="prospect-phone-error" message={fields.phoneError} />
        </div>
      </div>

      {requiresDealValue && (
        <ProspectQuoteSelector
          quoteId={fields.quoteId}
          onChange={setters.handleQuoteChange}
          matchingQuotes={matchingQuotes}
          selectedQuote={selectedQuote ?? null}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="deal">
          Valor del trato (MXN) {requiresDealValue && <RequiredMark />}
        </Label>
        <Input
          id="deal"
          type="number"
          min="0"
          step="0.01"
          value={fields.dealValue}
          onChange={(e) => setters.setDealValue(e.target.value)}
          className={fields.dealValueError ? "border-destructive" : ""}
          {...validationProps(fields.dealValueError, "prospect-deal-error")}
        />
        <FieldError id="prospect-deal-error" message={fields.dealValueError} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" value={fields.notes} onChange={(e) => setters.setNotes(e.target.value)} rows={3}
          {...validationProps(fields.notesError, "prospect-notes-error", "prospect-notes-limit")} />
        <p id="prospect-notes-limit" className="text-xs text-muted-foreground">Hasta 2,000 caracteres.</p>
        <FieldError id="prospect-notes-error" message={fields.notesError} />
      </div>
      <FieldError id="prospect-form-error" message={fields.formError} />
    </>
  );
}
