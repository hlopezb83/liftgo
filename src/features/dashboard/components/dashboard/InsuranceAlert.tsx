import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "@/components/icons";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateDisplay } from "@/lib/utils";
import type { InsuranceAlertsData } from "@/features/fleet";

interface InsuranceAlertProps {
  data: InsuranceAlertsData | undefined;
}

export function InsuranceAlert({ data }: InsuranceAlertProps) {
  const navigate = useNavigateTransition();
  const expiring = data?.expiring ?? [];
  const noInsuranceCount = data?.no_insurance_count ?? 0;

  if (expiring.length === 0 && noInsuranceCount === 0) return null;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-warning">
          <ShieldAlert className="h-4 w-4" /> Seguros ({expiring.length + noInsuranceCount})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {expiring.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between p-2 rounded-lg bg-background/80 text-sm cursor-pointer hover:bg-background"
            onClick={() => navigate(`/fleet/${f.id}`)}
          >
            <span className="font-medium">{f.name}</span>
            <div className="text-right">
              <span className={`font-mono font-semibold ${f.days_left <= 0 ? "text-destructive" : "text-warning"}`}>
                {f.days_left <= 0 ? "Vencida" : `${f.days_left} días`}
              </span>
              <p className="text-xs text-muted-foreground">Vence: {formatDateDisplay(f.insurance_expiry)}</p>
            </div>
          </div>
        ))}
        {noInsuranceCount > 0 && (
          <p className="text-xs text-muted-foreground pt-1 border-t">
            {noInsuranceCount} equipo(s) sin seguro registrado
          </p>
        )}
      </CardContent>
    </Card>
  );
}
