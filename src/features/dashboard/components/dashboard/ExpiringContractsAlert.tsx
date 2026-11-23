import { ROUTES } from "@/app-routes/routes";
import { ChevronRightIcon, DocumentIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateMty } from "@/lib/format/dateFormats";
import { Link } from "@/lib/router-compat-ui";

const VISIBLE_CONTRACT_LIMIT = 5;

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
  if (contracts.length === 0) return null;
  const visibleContracts = contracts.slice(0, VISIBLE_CONTRACT_LIMIT);

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-warning-text">
          <DocumentIcon className="h-4 w-4" /> Contratos por Vencer ({contracts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {visibleContracts.map((c) => (
          <Link
            key={c.id}
            to={ROUTES.contracts.detail(c.id)}
            className="flex items-center justify-between gap-2 rounded-lg bg-background/80 p-2 text-sm hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
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
                <span className={`tabular-nums font-semibold ${c.days_remaining <= 7 ? "text-destructive" : "text-warning-text"}`}>
                  {c.days_remaining} días
                </span>
                <p className="text-xs text-muted-foreground">Vence: {formatDateMty(c.end_date)}</p>
              </div>
              <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
            </div>
          </Link>
        ))}
        {visibleContracts.length < contracts.length && (
          <p className="text-xs text-muted-foreground">Mostrando {visibleContracts.length} de {contracts.length}</p>
        )}
      </CardContent>
    </Card>
  );
}
