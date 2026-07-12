import { useParams, useSearchParams } from "react-router";
import { useCustomers } from "@/features/customers";
import { useForklifts } from "@/features/fleet";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
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

  const { form, setForm, updateField, templateApplied, setTemplateApplied } =
    useContractFormState(existing, isEdit);

  useContractFormPrefill({
    isEdit, bookingId, form, setForm, customers, forklifts,
    templateApplied, setTemplateApplied,
  });

  const isPending = createContract.isPending || updateContract.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id || !form.forklift_id) {
      notifyValidation({ message: "Cliente y equipo son requeridos" });
      return;
    }
    const payload = buildContractPayload(form, bookingId);

    if (isEdit) {
      updateContract.mutate({ id, ...payload }, {
        onSuccess: () => { notifySuccess("Contrato actualizado"); navigate(`/contracts/${id}`); },
      });
    } else {
      createContract.mutate(payload, {
        onSuccess: (data) => {
          notifySuccess("Contrato creado");
          navigate(`/contracts/${data.id}`);
        },
      });
    }
  };

  return {
    id, isEdit, form, customers, forklifts, isPending,
    handleSubmit, updateField, navigate,
  };
}
