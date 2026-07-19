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
        <Label htmlFor="company">Empresa *</Label>
        <Input id="company" value={fields.company} onChange={(e) => setters.setCompany(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact">Persona de Contacto</Label>
        <Input id="contact" value={fields.contact} onChange={(e) => setters.setContact(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={fields.email} onChange={(e) => setters.setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" value={fields.phone} onChange={(e) => setters.setPhone(e.target.value)} />
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
          Valor del Trato (MXN) {requiresDealValue && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id="deal"
          type="number"
          min="0"
          step="0.01"
          value={fields.dealValue}
          onChange={(e) => setters.setDealValue(e.target.value)}
          className={fields.dealValueError ? "border-destructive" : ""}
        />
        {fields.dealValueError && <p className="text-xs text-destructive">{fields.dealValueError}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" value={fields.notes} onChange={(e) => setters.setNotes(e.target.value)} rows={3} />
      </div>
    </>
  );
}
