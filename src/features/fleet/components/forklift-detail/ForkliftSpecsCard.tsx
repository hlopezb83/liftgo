import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "@/components/icons";
import type { Tables } from "@/integrations/supabase/types";
import { FUEL_TYPE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format/formatCurrency";

interface ForkliftSpecsCardProps {
  forklift: Tables<"forklifts">;
  currentLocation?: string | null;
}

export function ForkliftSpecsCard({ forklift, currentLocation }: ForkliftSpecsCardProps) {
  const acquisitionCost = forklift.acquisition_cost;
  const specs = [
    { label: "Modelo", value: forklift.model },
    { label: "Fabricante", value: forklift.manufacturer },
    { label: "Año", value: forklift.year },
    { label: "Capacidad", value: forklift.capacity_kg ? `${forklift.capacity_kg} kg` : null },
    { label: "Altura del Mástil", value: forklift.mast_height_m ? `${forklift.mast_height_m} m` : null },
    { label: "Tipo de Combustible", value: forklift.fuel_type ? (FUEL_TYPE_LABELS[forklift.fuel_type] || forklift.fuel_type) : null },
    { label: "No. de Serie", value: forklift.serial_number },
    { label: "Costo de Adquisición", value: acquisitionCost ? formatCurrency(Number(acquisitionCost)) : null },
    { label: "Ubicación Actual", value: currentLocation || null },
    { label: "Aseguradora", value: forklift.insurance_provider || null },
    { label: "No. Póliza", value: forklift.insurance_policy_number || null },
    { label: "Vigencia Seguro", value: forklift.insurance_expiry || null },
    { label: "Costo Póliza", value: forklift.insurance_cost ? formatCurrency(Number(forklift.insurance_cost)) : null },
  ];

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Especificaciones</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {specs.map((s) => (
            <div key={s.label}>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-medium text-sm">{s.value || "—"}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
