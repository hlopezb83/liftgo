import { formatCurrency } from "@/lib/formatCurrency";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { parseDateLocal, formatDateDisplay } from "@/lib/utils";
import { ContractDetailActions } from "@/components/contracts/ContractDetailActions";
import { RentalFinancialSummary } from "@/components/contracts/RentalFinancialSummary";
import { ContractConditionsCard } from "@/components/contracts/ContractConditionsCard";
import { useContractDetailLogic } from "@/hooks/contractDetail/useContractDetailLogic";

export default function ContractDetail() {
  const { id, contract, isLoading, setStatus } = useContractDetailLogic();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!contract) return <div className="p-6 text-muted-foreground">Contrato no encontrado</div>;

  

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <DetailPageHeader
        title={contract.contract_number}
        backTo="/contracts"
        badges={<StatusBadge status={contract.status} />}
        actions={
          id ? (
            <ContractDetailActions
              id={id}
              status={contract.status}
              contract={contract}
              onSetStatus={setStatus}
            />
          ) : null
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{contract.customer_name || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Equipo</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{contract.forklift_name || "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalles del Contrato</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground block">Inicio</span>{formatDateDisplay(contract.start_date)}</div>
            <div><span className="text-muted-foreground block">Fin</span>{formatDateDisplay(contract.end_date)}</div>
            <div><span className="text-muted-foreground block">Depósito</span>{formatCurrency(Number(contract.deposit_amount || 0))}</div>
            <div><span className="text-muted-foreground block">Tarifa Diaria</span>{formatCurrency(Number(contract.daily_rate || 0))}</div>
            <div><span className="text-muted-foreground block">Tarifa Semanal</span>{formatCurrency(Number(contract.weekly_rate || 0))}</div>
            <div><span className="text-muted-foreground block">Tarifa Mensual</span>{formatCurrency(Number(contract.monthly_rate || 0))}</div>
            {contract.signed_at && <div><span className="text-muted-foreground block">Firmado</span>{format(parseDateLocal(contract.signed_at), "dd/MM/yyyy")}</div>}
            {contract.signed_by && <div><span className="text-muted-foreground block">Firmado por</span>{contract.signed_by}</div>}
          </div>
        </CardContent>
      </Card>

      <ContractConditionsCard contract={contract} />

      {contract.booking_id && contract.start_date && contract.end_date && (
        <RentalFinancialSummary
          bookingId={contract.booking_id}
          startDate={contract.start_date}
          endDate={contract.end_date}
          dailyRate={contract.daily_rate}
          weeklyRate={contract.weekly_rate}
          monthlyRate={contract.monthly_rate}
        />
      )}

      {contract.terms_text && (
        <Card>
          <CardHeader><CardTitle className="text-base">Términos y Condiciones</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{contract.terms_text}</p></CardContent>
        </Card>
      )}

      {contract.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{contract.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
