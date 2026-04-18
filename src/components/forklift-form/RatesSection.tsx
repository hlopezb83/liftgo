import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ForkliftFormData } from "@/lib/formSchemas";

interface Props {
  form: ForkliftFormData;
  set: <K extends keyof ForkliftFormData>(key: K, value: ForkliftFormData[K]) => void;
}

export function RatesSection({ form, set }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tarifas y Costos</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tarifa Diaria ($)</Label>
          <Input type="number" placeholder="150" value={form.daily_rate} onChange={(e) => set("daily_rate", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Tarifa Semanal ($)</Label>
          <Input type="number" placeholder="750" value={form.weekly_rate} onChange={(e) => set("weekly_rate", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Tarifa Mensual ($)</Label>
          <Input type="number" placeholder="2500" value={form.monthly_rate} onChange={(e) => set("monthly_rate", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Costo de Adquisición ($)</Label>
          <Input type="number" placeholder="250000" value={form.acquisition_cost} onChange={(e) => set("acquisition_cost", e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}
