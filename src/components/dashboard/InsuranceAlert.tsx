import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateDisplay } from "@/lib/utils";

interface InsuranceAlertProps {
  forklifts: Array<{ id: string; name: string; insurance_expiry: string | null; insurance_provider: string | null }>;
}

export function InsuranceAlert({ forklifts }: InsuranceAlertProps) {
  const navigate = useNavigate();

  const expiring = forklifts.filter((f) => {
    if (!f.insurance_expiry) return false;
    const daysLeft = Math.ceil((new Date(f.insurance_expiry).getTime() - Date.now()) / 86400000);
    return daysLeft <= 30;
  }).map((f) => ({
    ...f,
    daysLeft: Math.ceil((new Date(f.insurance_expiry!).getTime() - Date.now()) / 86400000),
  })).sort((a, b) => a.daysLeft - b.daysLeft);

  const noInsurance = forklifts.filter((f) => !f.insurance_expiry && !["sold", "retired"].includes((f as any).status));

  if (expiring.length === 0 && noInsurance.length === 0) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-amber-600">
          <ShieldAlert className="h-4 w-4" /> Seguros ({expiring.length + noInsurance.length})
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
              <span className={`font-mono font-semibold ${f.daysLeft <= 0 ? "text-destructive" : "text-amber-600"}`}>
                {f.daysLeft <= 0 ? "Vencida" : `${f.daysLeft} días`}
              </span>
              <p className="text-xs text-muted-foreground">Vence: {formatDateDisplay(f.insurance_expiry)}</p>
            </div>
          </div>
        ))}
        {noInsurance.length > 0 && (
          <p className="text-xs text-muted-foreground pt-1 border-t">
            {noInsurance.length} equipo(s) sin seguro registrado
          </p>
        )}
      </CardContent>
    </Card>
  );
}
