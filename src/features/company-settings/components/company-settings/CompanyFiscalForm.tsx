import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Save } from "lucide-react";
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";

interface FiscalFormValues {
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  lugar_expedicion: string;
  logo_url: string;
}

interface Props {
  form: FiscalFormValues;
  set: <K extends keyof FiscalFormValues>(key: K, value: FiscalFormValues[K]) => void;
  isPending: boolean;
}

export function CompanyFiscalForm({ form, set, isPending }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Información Fiscal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>RFC *</Label>
            <Input value={form.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} placeholder="XAXX010101000" maxLength={13} />
          </div>
          <div className="space-y-1.5">
            <Label>Razón Social *</Label>
            <Input value={form.razon_social} onChange={(e) => set("razon_social", e.target.value)} placeholder="Mi Empresa S.A. de C.V." />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Régimen Fiscal *</Label>
            <Select value={form.regimen_fiscal} onValueChange={(v) => set("regimen_fiscal", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar régimen" /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto z-50">
                {REGIMEN_FISCAL.map((r) => (
                  <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Lugar de Expedición (C.P.) *</Label>
            <Input value={form.lugar_expedicion} onChange={(e) => set("lugar_expedicion", e.target.value)} placeholder="06600" maxLength={5} />
          </div>
        </div>


        <div className="pt-2">
          <Button type="submit" disabled={isPending}>
            <Save className="h-4 w-4 mr-1" />
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
