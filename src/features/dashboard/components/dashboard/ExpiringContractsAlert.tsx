import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentIcon, RefreshIcon } from "@/components/icons";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateDisplay } from "@/lib/utils";

interface ExpiringContract {
  id: string;
  contract_number: string;
  customer_name: string | null;
  forklift_name: string | null;
  end_date: string;
  days_remaining: number;
}

interface ExpiringContractsAlertProps {
  contracts: ExpiringContract[];
}

export function ExpiringContractsAlert({ contracts }: ExpiringContractsAlertProps) {
  const navigate = useNavigateTransition();

  if (contracts.length === 0) return null;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-warning">
          <DocumentIcon className="h-4 w-4" /> Contratos por Vencer ({contracts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {contracts.slice(0, 5).map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between p-2 rounded-lg bg-background/80 text-sm cursor-pointer hover:bg-background"
            onClick={() => navigate(`/contracts/${c.id}`)}
          >
            <div>
              <span className="font-medium">{c.contract_number}</span>
              <span className="text-muted-foreground ml-2">{c.customer_name}</span>
              {c.forklift_name && (
                <span className="text-muted-foreground ml-1">— {c.forklift_name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <span className={`font-mono font-semibold ${c.days_remaining <= 7 ? "text-destructive" : "text-warning"}`}>
                  {c.days_remaining} días
                </span>
                <p className="text-xs text-muted-foreground">Vence: {formatDateDisplay(c.end_date)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => { e.stopPropagation(); navigate(`/contracts/${c.id}`); }}
                title="Ver Contrato"
              >
                <RefreshIcon className="h-4 w-4 text-warning" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
