import { FleetIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";
import { FUEL_TYPE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { useCanSeeFinancialCosts } from "../../hooks/useCanSeeFinancialCosts";

interface ForkliftSpecsCardProps {
  forklift: Tables<"forklifts">;
  currentLocation?: string | null;
  /** 10.8: la query de ubicación falló — no confundir con "sin ubicación". */
  locationError?: boolean;
}

export function ForkliftSpecsCard({ forklift, currentLocation, locationError }: ForkliftSpecsCardProps) {
  // H-9: costo de adquisición y costo de póliza son datos financieros
  // sensibles; el resto de las especificaciones sigue visible para todos.
  const canSeeCosts = useCanSeeFinancialCosts();
  const specs = [
    { label: "Modelo", value: forklift.model },
    { label: "Fabricante", value: forklift.manufacturer },
    { label: "Año", value: forklift.year },
    { label: "Capacidad", value: forklift.capacity_kg ? `${forklift.capacity_kg} kg` : null },
    { label: "Altura del Mástil", value: forklift.mast_height_m ? `${forklift.mast_height_m} m` : null },
    { label: "Tipo de Combustible", value: forklift.fuel_type ? (FUEL_TYPE_LABELS[forklift.fuel_type] || forklift.fuel_type) : null },
    { label: "No. de Serie", value: forklift.serial_number },
    ...(canSeeCosts ? [{ label: "Costo de Adquisición", value: forklift.acquisition_cost == null ? null : formatCurrency(Number(forklift.acquisition_cost)) }] : []),
    { label: "Ubicación registrada", value: locationError ? "No se pudo cargar la ubicación" : (currentLocation || "Sin ubicación confirmada"),
      help: locationHelp(currentLocation, locationError) },
  ];
  const insurance = [
    { label: "Aseguradora", value: forklift.insurance_provider?.trim() ? forklift.insurance_provider : null },
    { label: "No. Póliza", value: forklift.insurance_policy_number?.trim() ? forklift.insurance_policy_number : null },
    { label: "Vigencia Seguro", value: forklift.insurance_expiry?.trim() ? forklift.insurance_expiry : null },
    ...(canSeeCosts ? [{ label: "Costo Póliza", value: forklift.insurance_cost == null ? null : formatCurrency(Number(forklift.insurance_cost)) }] : []),
  ];
  const hasInsuranceData = insurance.some((field) => field.value != null);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><FleetIcon className="h-4 w-4" /> Especificaciones</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {specs.map((s) => (
            <div key={s.label} className="min-w-0">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-medium text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{s.value ?? "—"}</p>
              {s.help && <p className="mt-1 text-xs text-muted-foreground">{s.help}</p>}
            </div>
          ))}
        </div>
        <details key={`${forklift.id}-${canSeeCosts}-${hasInsuranceData}`} open={hasInsuranceData} className="mt-4 border-t pt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {hasInsuranceData ? "Seguro" : "Seguro: sin datos registrados"}
            {!hasInsuranceData && <span className="ml-2 text-xs text-muted-foreground">Ver campos</span>}
          </summary>
          <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
            {insurance.map((field) => (
              <div key={field.label} className="min-w-0">
                <p className="text-xs text-muted-foreground">{field.label}</p>
                <p className="font-medium text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{field.value ?? "—"}</p>
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function locationHelp(location?: string | null, error?: boolean) {
  return !error && location ? "Del contrato o último movimiento registrado. Puede ser histórica." : null;
}
