import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { XmlFieldKey, XmlFieldMapping } from "../lib/xmlParsers";

const FIELD_LABELS: Record<XmlFieldKey, string> = {
  date: "Fecha *",
  description: "Descripción",
  charge: "Cargo",
  credit: "Abono",
  amount: "Importe único",
  reference: "Referencia",
  type: "Tipo (cargo/abono)",
};

const FIELD_ORDER: XmlFieldKey[] = ["date", "description", "charge", "credit", "amount", "reference", "type"];
const NONE = "__none__";

interface Props {
  availableFields: string[];
  mapping: XmlFieldMapping;
  onChange: (mapping: XmlFieldMapping) => void;
}

export function BankXmlFieldMapper({ availableFields, mapping, onChange }: Props) {
  const setField = (key: XmlFieldKey, value: string) => {
    const next = { ...mapping };
    if (value === NONE) delete next[key];
    else next[key] = value;
    onChange(next);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Mapeo de campos del XML</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Indica qué campo del archivo corresponde a cada dato. Se recuerda para las siguientes importaciones de esta cuenta.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {FIELD_ORDER.map((key) => (
            <div key={key} className="grid gap-1.5">
              <Label className="text-xs">{FIELD_LABELS[key]}</Label>
              <Select value={mapping[key] ?? NONE} onValueChange={(v) => setField(key, v)}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin asignar</SelectItem>
                  {availableFields.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
