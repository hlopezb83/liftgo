import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ForkliftFormData } from "@/lib/formSchemas";

interface Props {
  form: ForkliftFormData;
  set: <K extends keyof ForkliftFormData>(key: K, value: ForkliftFormData[K]) => void;
}

export function InsuranceSection({ form, set }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Seguro</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Aseguradora</Label>
          <Input placeholder="Ej: GNP Seguros" value={form.insurance_provider} onChange={(e) => set("insurance_provider", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>No. de Póliza</Label>
          <Input placeholder="Ej: POL-2026-001" value={form.insurance_policy_number} onChange={(e) => set("insurance_policy_number", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Vigencia</Label>
          <Input type="date" value={form.insurance_expiry} onChange={(e) => set("insurance_expiry", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Costo de Póliza ($)</Label>
          <Input type="number" placeholder="15000" value={form.insurance_cost} onChange={(e) => set("insurance_cost", e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}
