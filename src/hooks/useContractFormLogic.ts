import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useContract, useCreateContract, useUpdateContract } from "@/hooks/useContracts";
import { useCustomers } from "@/hooks/useCustomers";
import { useForklifts } from "@/hooks/useForklifts";
import { useContractFormState } from "./contractForm/useContractFormState";
import { useContractFormPrefill } from "./contractForm/useContractFormPrefill";

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
      toast.error("Cliente y equipo son requeridos");
      return;
    }
    const payload = {
      customer_id: form.customer_id,
      forklift_id: form.forklift_id,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      daily_rate: Number(form.daily_rate),
      weekly_rate: Number(form.weekly_rate),
      monthly_rate: Number(form.monthly_rate),
      deposit_amount: Number(form.deposit_amount),
      terms_text: form.terms_text || null,
      signed_by: form.signed_by || null,
      notes: form.notes || null,
      booking_id: bookingId || null,
      status: "draft",
      signed_at: null,
      usage_location: form.usage_location || null,
      max_hours_per_month: form.max_hours_per_month ? Number(form.max_hours_per_month) : null,
      extra_hour_rate: form.extra_hour_rate ? Number(form.extra_hour_rate) : null,
      payment_frequency: form.payment_frequency || "Mensual",
      late_interest_rate: form.late_interest_rate ? Number(form.late_interest_rate) : 5,
      contract_city: form.contract_city || "San Pedro Garza García, N.L.",
      witness_1: form.witness_1 || null,
      witness_2: form.witness_2 || null,
    };

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
