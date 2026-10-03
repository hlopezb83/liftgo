import { Badge } from "@/components/ui/badge";
import {
  ORGANIZATION_CLASSIFICATION_LABELS, type OrganizationClassification, type OrganizationGovernance,
} from "@/lib/platformOrganizationGovernance.types";

export function OrganizationClassificationBadge({ classification }: { classification?: OrganizationClassification }) {
  return <Badge variant={classification === "test" ? "secondary" : "outline"}>
    {classification ? ORGANIZATION_CLASSIFICATION_LABELS[classification] : "Clasificación sin consultar"}
  </Badge>;
}
export function OrganizationGovernanceSummary({ data }: { data: OrganizationGovernance }) {
  const values = [
    ["Ciudad", data.city], ["Territorio", data.territory], ["Contacto", data.contactName],
    ["Correo", data.contactEmail], ["Teléfono", data.contactPhone],
  ];
  return <div className="space-y-4">
    <OrganizationClassificationBadge classification={data.classification} />
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {values.map(([label, value]) => <div key={label} className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words text-sm">{value || "Sin definir"}</dd>
      </div>)}
    </dl>
  </div>;
}
