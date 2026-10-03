import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ORGANIZATION_CLASSIFICATION_LABELS, type OrganizationGovernanceFields as GovernanceFieldsValues,
} from "@/lib/platformOrganizationGovernance.types";

const fields = [
  ["city", "Ciudad", 100, "text"], ["territory", "Territorio", 120, "text"],
  ["contactName", "Contacto", 120, "text"], ["contactEmail", "Correo del contacto", 254, "email"],
  ["contactPhone", "Teléfono del contacto", 40, "tel"],
] as const;
export function OrganizationGovernanceFields({
  values, reason, disabled, onChange, onReason,
}: {
  values: GovernanceFieldsValues; reason: string; disabled: boolean;
  onChange: (values: GovernanceFieldsValues) => void; onReason: (value: string) => void;
}) {
  return <fieldset disabled={disabled} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="governance-classification">Clasificación</Label>
        <select id="governance-classification" className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          value={values.classification} onChange={(e) => onChange({ ...values, classification: e.target.value as GovernanceFieldsValues["classification"] })}>
          {Object.entries(ORGANIZATION_CLASSIFICATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {fields.map(([key, label, maxLength, type]) => <div key={key} className="space-y-2">
        <Label htmlFor={"governance-" + key}>{label}</Label>
        <Input id={"governance-" + key} type={type} autoComplete="off" maxLength={maxLength} className="h-11"
          value={values[key]} onChange={(e) => onChange({ ...values, [key]: e.target.value })} />
      </div>)}
    </div>
    <div className="space-y-2">
      <Label htmlFor="governance-reason">Motivo del cambio</Label>
      <Textarea id="governance-reason" value={reason} maxLength={500} rows={3}
        placeholder="Explica brevemente qué cambió y por qué."
        onChange={(e) => onReason(e.target.value)} />
    </div>
    <p className="text-sm text-muted-foreground">La clasificación no cambia el ambiente de facturación ni las llaves de la empresa.</p>
  </fieldset>;
}
