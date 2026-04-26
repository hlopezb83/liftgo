import { useParams, useNavigate } from "react-router-dom";
import { useContract, useUpdateContract } from "@/hooks/useContracts";
import { formatCurrency } from "@/lib/formatCurrency";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { parseDateLocal, formatDateDisplay } from "@/lib/utils";
import { ContractDetailActions } from "@/components/contracts/ContractDetailActions";
import { RentalFinancialSummary } from "@/components/contracts/RentalFinancialSummary";
import { toast } from "sonner";

export default function ContractDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  void navigate;
  const { data: contract, isLoading } = useContract(id);
  const updateContract = useUpdateContract();

  const setStatus = (status: string, extra?: Record<string, unknown>) => {
    if (!id) return;
    updateContract.mutate(
      { id, status, ...extra },
      { onSuccess: () => toast.success(`Contrato marcado como ${status}`) }
    );
  };

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
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

      {(contract.usage_location || contract.max_hours_per_month || contract.payment_frequency) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Condiciones de Uso</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {contract.usage_location && <div className="col-span-2 sm:col-span-3"><span className="text-muted-foreground block">Ubicación de Uso</span>{contract.usage_location}</div>}
              {contract.max_hours_per_month && <div><span className="text-muted-foreground block">Horas Máx/Mes</span>{contract.max_hours_per_month}</div>}
              {contract.extra_hour_rate && <div><span className="text-muted-foreground block">Tarifa Hora Extra</span>{formatCurrency(Number(contract.extra_hour_rate))}</div>}
              {contract.payment_frequency && <div><span className="text-muted-foreground block">Frecuencia de Pago</span>{contract.payment_frequency}</div>}
              {contract.late_interest_rate && <div><span className="text-muted-foreground block">Interés Moratorio</span>{contract.late_interest_rate}%</div>}
              {contract.witness_1 && <div><span className="text-muted-foreground block">Testigo 1</span>{contract.witness_1}</div>}
              {contract.witness_2 && <div><span className="text-muted-foreground block">Testigo 2</span>{contract.witness_2}</div>}
            </div>
          </CardContent>
        </Card>
      )}

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
