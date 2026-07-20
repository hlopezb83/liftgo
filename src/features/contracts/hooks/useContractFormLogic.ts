import { useParams, useSearchParams } from "react-router";
import { useCustomers } from "@/features/customers";
import { useForklifts } from "@/features/fleet";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { notifySuccess } from "@/lib/ui/appFeedback";
import type { ContractFormValues } from "../lib/contractFormSchema";
import { buildContractPayload } from "../lib/contractPayload";
import { useContractFormPrefill } from "./contractForm/useContractFormPrefill";
import { useContractFormState } from "./contractForm/useContractFormState";
import { useContract, useCreateContract, useUpdateContract } from "./useContracts";

export function useContractFormLogic() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigateTransition();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking_id");
  const { data: existing } = useContract(isEdit ? id : undefined);
  const { data: customers } = useCustomers();
  const { data: forklifts } = useForklifts();
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();

  const { form, templateApplied, setTemplateApplied } = useContractFormState(existing, isEdit);

  useContractFormPrefill({
    isEdit, bookingId, form, customers, forklifts,
    templateApplied, setTemplateApplied,
  });

  const isPending = createContract.isPending || updateContract.isPending;

  useUnsavedChangesGuard(form.formState.isDirty && !isPending);

  const onSubmit = (values: ContractFormValues) => {
    const payload = buildContractPayload(values, bookingId);
    if (isEdit && id) {
      updateContract.mutate({ id, ...payload }, {
        onSuccess: () => {
          notifySuccess("Contrato actualizado");
          form.reset(values); // clears isDirty for the guard
          navigate(`/contracts/${id}`);
        },
      });
    } else {
      createContract.mutate(payload, {
        onSuccess: (data) => {
          notifySuccess("Contrato creado");
          form.reset(values);
          navigate(`/contracts/${data.id}`);
        },
      });
    }
  };

  const handleSubmit = form.handleSubmit(onSubmit);

  return { id, isEdit, form, customers, forklifts, isPending, handleSubmit, navigate };
}
