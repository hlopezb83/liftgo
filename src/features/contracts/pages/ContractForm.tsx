import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormActions } from "@/components/forms/FormActions";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import { FormErrorSummaryScope } from "@/components/forms/FormErrorSummaryScope";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GeneralInfoCard,
  RatesCard,
  UsageConditionsCard,
  TermsAndSignaturesCard,
} from "../components/ContractFormSections";
import { MissingLegalRepAlert } from "../components/contracts/MissingLegalRepAlert";
import { useContractFormLogic } from "../hooks/useContractFormLogic";
import type { ContractFormValues } from "../lib/contractFormSchema";

const ERROR_LABELS = {
  customer_id: "Cliente", forklift_id: "Equipo", start_date: "Fecha de inicio", end_date: "Fecha de fin",
  daily_rate: "Tarifa diaria", weekly_rate: "Tarifa semanal", monthly_rate: "Tarifa mensual", deposit_amount: "Depósito",
  terms_text: "Términos y condiciones", signed_by: "Firmado por", notes: "Notas", usage_location: "Ubicación de uso del equipo",
  max_hours_per_month: "Horas máximas por mes", extra_hour_rate: "Tarifa por hora extra", payment_frequency: "Frecuencia de pago",
  late_interest_rate: "Interés moratorio", contract_city: "Ciudad del contrato", witness_1: "Testigo 1", witness_2: "Testigo 2",
} satisfies Record<keyof ContractFormValues, string>;

function contractErrorLabel(name: string): string {
  return ERROR_LABELS[name as keyof typeof ERROR_LABELS] ?? "Campo";
}

function ContractInitialState({ query, onBack }: { query: ReturnType<typeof useContractFormLogic>["readQuery"]; onBack: () => void }) {
  if (query.isError) return <QueryErrorState entity="el contrato" error={query.error}
    isRetrying={query.isFetching} onRetry={() => { void query.refetch(); }} />;
  if (query.isSuccess && !query.data) return <EmptyState title="Contrato no encontrado" subtitle="El registro ya no está disponible."
    actionLabel="Volver a contratos" onAction={onBack} />;
  return <div role="status" aria-label="Cargando contrato" className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;
}

function needsLegalRepresentativeFor(customer: { rfc?: string | null; representante_legal?: string | null } | undefined) {
  return Boolean(customer?.rfc?.trim().length === 12 && !customer.representante_legal?.trim());
}

export default function ContractForm() {
  const { isEdit, contractNumber, linkedBookingId, returnTo, form, customers, forklifts, isPending, handleSubmit, navigate, readQuery, initialRecordReady } = useContractFormLogic();
  const { control } = form;
  const customerId = form.watch("customer_id");
  const selected = customers?.find((c) => c.id === customerId);
  const needsLegalRepresentative = needsLegalRepresentativeFor(selected);

  if (!initialRecordReady) return <PageContainer maxWidth="form">
    <FormPageHeader title="Editar contrato" onBack={() => navigate(returnTo)} />
    <ContractInitialState query={readQuery} onBack={() => navigate("/contracts")} />
  </PageContainer>;

  return (
    <PageContainer maxWidth="form">
      <FormPageHeader
        title={isEdit ? "Editar contrato" : "Nuevo contrato"}
        subtitle={isEdit ? contractNumber ?? undefined : undefined}
        onBack={() => navigate(returnTo)}
      />

      {isEdit && readQuery.isError && <QueryErrorState entity="el contrato" error={readQuery.error}
        isRetrying={readQuery.isFetching} onRetry={() => { void readQuery.refetch(); }} />}

      <Form {...form}>
        <FormErrorSummaryScope>
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <FormErrorSummary labelFor={contractErrorLabel} />
          <GeneralInfoCard control={control} customers={customers || []} forklifts={forklifts || []} linkedToBooking={!!linkedBookingId} />
          {needsLegalRepresentative && selected && (
            <MissingLegalRepAlert customerId={selected.id} customerName={selected.name} />
          )}
          <RatesCard control={control} />
          <UsageConditionsCard control={control} />
          <TermsAndSignaturesCard control={control} />
          <FormActions
            submitLabel={isEdit ? "Guardar cambios" : "Crear contrato"}
            isPending={isPending}
            submitDisabled={needsLegalRepresentative}
            submitDisabledReason={needsLegalRepresentative ? "Captura el representante legal antes de generar el contrato." : undefined}
            onCancel={() => navigate(returnTo)}
          />
        </form>
        </FormErrorSummaryScope>
      </Form>
    </PageContainer>
  );
}

