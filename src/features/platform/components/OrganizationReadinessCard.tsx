import { SuccessIcon, WarnIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PlatformOrganizationDetail } from "@/lib/platformOrganizationDetail.types";
import { organizationReadiness } from "../lib/organizationReadiness";

export function OrganizationReadinessCard({
  detail,
}: {
  detail: PlatformOrganizationDetail;
}) {
  const items = organizationReadiness(detail);
  const required = items.filter((item) => item.required);
  const completed = required.filter((item) => item.ready).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist de habilitación</CardTitle>
        <CardDescription>
          {completed} de {required.length} requisitos configurados. Este
          checklist no habilita ni bloquea el acceso.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
            >
              {item.ready ? (
                <SuccessIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <WarnIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{item.label}</p>
                  <Badge variant={item.ready ? "outline" : "secondary"}>
                    {item.ready
                      ? "Configurado"
                      : item.required
                        ? "Pendiente"
                        : "Recomendado"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
