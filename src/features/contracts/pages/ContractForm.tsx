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
import { useContractFormLogic } from "../hooks/useContractFormLogic";

export default function ContractForm() {
  const { isEdit, form, customers, forklifts, isPending, handleSubmit, navigate } = useContractFormLogic();
  const { control } = form;

  return (
    <PageContainer maxWidth="form">
      <FormPageHeader title={isEdit ? "Editar Contrato" : "Nuevo Contrato"} onBack={() => navigate("/contracts")} />

      <Form {...form}>
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <GeneralInfoCard control={control} customers={customers || []} forklifts={forklifts || []} />
          <RatesCard control={control} />
          <UsageConditionsCard control={control} />
          <TermsAndSignaturesCard control={control} />
          <FormActions submitLabel={isEdit ? "Guardar Cambios" : "Crear Contrato"} isPending={isPending} onCancel={() => navigate("/contracts")} />
        </form>
      </Form>
    </PageContainer>
  );
}
