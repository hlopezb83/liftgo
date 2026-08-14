import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DuplicateIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { usePortalCollectionAccount } from "../hooks/usePortalExtras";

interface Props {
  amount: number;
  concept: string;
}

function copy(text: string, label: string) {
  // FIX-FE-12a: sin catch, un rechazo del clipboard (permiso denegado, pestaña
  // sin foco) dejaba unhandled rejection y el usuario sin feedback.
  navigator.clipboard.writeText(text)
    .then(() => notifySuccess(`${label} copiado`))
    .catch(() => notifyError({
      title: `No se pudo copiar ${label.toLowerCase()}`,
      description: "Copia el dato manualmente.",
      severity: "warning",
    }));
}

export function StpTransferCard({ amount, concept }: Props) {
  const { data, isLoading, isError, refetch, isRefetching } = usePortalCollectionAccount();

  if (isLoading) return <Skeleton className="h-64" />;
  // A-01: NUNCA mostrar "cuenta no configurada" cuando la query falló (red,
  // outage) — el cliente podría creer que no puede pagar por SPEI. Mismo
  // patrón de error+retry que PortalDashboard.
  if (isError) {
    return (
      <QueryErrorState
        entity="los datos para transferencia"
        onRetry={() => void refetch()}
        isRetrying={isRefetching}
      />
    );
  }
  if (!data || !data.clabe) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Datos para transferencia</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            La cuenta para recibir transferencias no está configurada. Contacta a tu ejecutivo.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rows: Array<{ label: string; value: string; copyable?: boolean }> = [
    { label: "Beneficiario", value: data.account_holder ?? "—" },
    { label: "Banco", value: data.bank ?? "—" },
    { label: "CLABE", value: data.clabe, copyable: true },
    ...(data.account_number ? [{ label: "Cuenta", value: data.account_number, copyable: true }] : []),
    { label: "Monto", value: formatCurrency(amount) },
    { label: "Concepto / Referencia", value: concept, copyable: true },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Datos para transferencia SPEI</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{r.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{r.value}</span>
                {r.copyable && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(r.value, r.label)} aria-label={`Copiar ${r.label}`}>
                    <DuplicateIcon className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
          Realiza la transferencia con el monto y concepto exactos. Una vez completada, reporta el pago para acelerar la conciliación.
        </div>
      </CardContent>
    </Card>
  );
}
