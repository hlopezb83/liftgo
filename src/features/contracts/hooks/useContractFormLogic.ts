import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { notifyError } from "@/lib/ui/appFeedback";
import { toast } from "sonner";
import { useContract, useCreateContract, useUpdateContract } from "@/features/contracts/hooks/useContracts";
import { useCustomers } from "@/features/customers/hooks/customers/useCustomers";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useContractFormState } from "./contractForm/useContractFormState";
import { useContractFormPrefill } from "./contractForm/useContractFormPrefill";
import { buildContractPayload } from "@/features/contracts/lib/contractPayload";

export function useContractFormLogic() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
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
      notifyError({ message: "Cliente y equipo son requeridos" });
      return;
    }
    const payload = buildContractPayload(form, bookingId);

    if (isEdit) {
      updateContract.mutate({ id, ...payload }, {
        onSuccess: () => { toast.success("Contrato actualizado"); navigate(`/contracts/${id}`); },
      });
    } else {
      createContract.mutate(payload, {
        onSuccess: (data) => {
          toast.success("Contrato creado");
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
