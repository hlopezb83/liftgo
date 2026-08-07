import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Form } from "@/components/ui/form";
import {
  GeneralInfoCard,
  RatesCard,
  UsageConditionsCard,
  TermsAndSignaturesCard,
} from "../components/ContractFormSections";
import { MissingLegalRepAlert } from "../components/contracts/MissingLegalRepAlert";
import { useContractFormLogic } from "../hooks/useContractFormLogic";

export default function ContractForm() {
  const { isEdit, form, customers, forklifts, isPending, handleSubmit, navigate } = useContractFormLogic();
  const { control } = form;
  const customerId = form.watch("customer_id");
  const selected = customers?.find((c) => c.id === customerId);
  const showLegalRepAlert = !!selected && !selected.representante_legal;

  return (
    <PageContainer maxWidth="form">
      <FormPageHeader title={isEdit ? "Editar contrato" : "Nuevo contrato"} onBack={() => navigate("/contracts")} />

      <Form {...form}>
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <GeneralInfoCard control={control} customers={customers || []} forklifts={forklifts || []} />
          {showLegalRepAlert && selected && (
            <MissingLegalRepAlert customerId={selected.id} customerName={selected.name} />
          )}
          <RatesCard control={control} />
          <UsageConditionsCard control={control} />
          <TermsAndSignaturesCard control={control} />
          <FormActions submitLabel={isEdit ? "Guardar cambios" : "Crear contrato"} isPending={isPending} onCancel={() => navigate("/contracts")} />
        </form>
      </Form>
    </PageContainer>
  );
}

