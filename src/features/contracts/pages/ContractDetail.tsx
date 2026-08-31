import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { ContractConditionsCard } from "../components/contracts/ContractConditionsCard";
import { ContractDepositCard } from "../components/contracts/ContractDepositCard";
import { ContractDetailActions } from "../components/contracts/ContractDetailActions";
import { ContractDetailsCard, ContractTextCard } from "../components/contracts/ContractDetailCards";
import { RentalFinancialSummary } from "../components/contracts/RentalFinancialSummary";
import { useContractDetailLogic } from "../hooks/contractDetail/useContractDetailLogic";
import { CONTRACT_STATUS_LABELS } from "../lib/contractStatusLabels";

type ContractData = NonNullable<ReturnType<typeof useContractDetailLogic>["contract"]>;

function contractDates(contract: { start_date: string | null; end_date: string | null }) {
  return { start: contract.start_date ?? "", end: contract.end_date ?? "" };
}

/** Normaliza las columnas opcionales del depósito a `null`. */
function depositProps(contract: ContractData, contractId: string) {
  return {
    contractId,
    depositAmount: contract.deposit_amount,
    depositStatus: contract.deposit_status ?? null,
    depositSettledAt: contract.deposit_settled_at ?? null,
    depositSettledAmount: contract.deposit_settled_amount ?? null,
    depositNotes: contract.deposit_notes ?? null,
  };
}

function InfoCard({ title, value }: { title: string; value: string | null | undefined }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="text-sm">
        <p className="font-medium">{value ?? "—"}</p>
      </CardContent>
    </Card>
  );
}

function ContractDetailFallback({
  isLoading, isError, refetch, onBack,
}: { isLoading: boolean; isError: boolean; refetch: () => void; onBack: () => void }) {
  if (isLoading) {
    return (
      <PageContainer className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </PageContainer>
    );
  }
  if (isError) {
    return (
      <PageContainer>
        <QueryErrorState entity="el contrato" onRetry={refetch} />
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <EmptyState title="Contrato no encontrado" actionLabel="Volver" onAction={onBack} />
    </PageContainer>
  );
}

export default function ContractDetail() {
  const navigate = useNavigateTransition();
  const { id, contract, isLoading, isError, refetch, setStatus } = useContractDetailLogic();

  if (isLoading || isError || !contract || !id) {
    return (
      <ContractDetailFallback
        isLoading={isLoading}
        isError={isError}
        refetch={() => { void refetch(); }}
        onBack={() => navigate("/contracts")}
      />
    );
  }

  const { start, end } = contractDates(contract);
  const showFinancials = Boolean(contract.booking_id && start && end);

  return (
    <PageContainer maxWidth="wide">
      <DetailPageHeader
        title={contract.contract_number}
        backTo="/contracts"
        badges={<StatusBadge status={contract.status} label={CONTRACT_STATUS_LABELS[contract.status]} />}
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
        <InfoCard title="Cliente" value={contract.customer_name} />
        <InfoCard title="Equipo" value={contract.forklift_name} />
      </div>

      <ContractDetailsCard
        startDate={start}
        endDate={end}
        depositAmount={contract.deposit_amount}
        dailyRate={contract.daily_rate}
        weeklyRate={contract.weekly_rate}
        monthlyRate={contract.monthly_rate}
        signedAt={contract.signed_at}
        signedBy={contract.signed_by}
      />

      <ContractDepositCard {...depositProps(contract, id)} />

      <ContractConditionsCard contract={contract} />

      {showFinancials && (
        <RentalFinancialSummary
          bookingId={contract.booking_id ?? ""}
          startDate={start}
          endDate={end}
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
    </PageContainer>
  );
}

