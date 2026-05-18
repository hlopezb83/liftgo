import { DetailPageHeader } from "@/components/DetailPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ContractDetailActions } from "@/features/contracts/components/contracts/ContractDetailActions";
import { RentalFinancialSummary } from "@/features/contracts/components/contracts/RentalFinancialSummary";
import { ContractConditionsCard } from "@/features/contracts/components/contracts/ContractConditionsCard";
import { ContractDetailsCard, ContractTextCard } from "@/features/contracts/components/contracts/ContractDetailCards";
import { useContractDetailLogic } from "@/features/contracts/hooks/contractDetail/useContractDetailLogic";

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
  if (!contract || !id) return <div className="p-6 text-muted-foreground">Contrato no encontrado</div>;

  const showFinancials = Boolean(contract.booking_id && contract.start_date && contract.end_date);

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <DetailPageHeader
        title={contract.contract_number}
        backTo="/contracts"
        badges={<StatusBadge status={contract.status} />}
        actions={
          <ContractDetailActions
            id={id}
            status={contract.status}
            contract={contract}
            onSetStatus={setStatus}
          />
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{contract.customer_name ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Equipo</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{contract.forklift_name ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      <ContractDetailsCard
        startDate={contract.start_date}
        endDate={contract.end_date}
        depositAmount={contract.deposit_amount}
        dailyRate={contract.daily_rate}
        weeklyRate={contract.weekly_rate}
        monthlyRate={contract.monthly_rate}
        signedAt={contract.signed_at}
        signedBy={contract.signed_by}
      />

      <ContractConditionsCard contract={contract} />

      {showFinancials && (
        <RentalFinancialSummary
          bookingId={contract.booking_id ?? ""}
          startDate={contract.start_date}
          endDate={contract.end_date}
          dailyRate={contract.daily_rate}
          weeklyRate={contract.weekly_rate}
          monthlyRate={contract.monthly_rate}
        />
      )}

      {contract.terms_text && <ContractTextCard title="Términos y Condiciones" content={contract.terms_text} />}
      {contract.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{contract.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
