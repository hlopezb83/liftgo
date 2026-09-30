import { useMemo } from "react";
import { useBooking } from "@/features/bookings";
import { useCustomer, useCustomers } from "@/features/customers";
import { useForklift, useForklifts } from "@/features/fleet";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useParams, useSearchParams } from "@/lib/router-compat";
import { notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";
import { contractFormReturnTo } from "../lib/contractFormNavigation";
import { buildContractPayload } from "../lib/contractPayload";
import { useContractFormPrefill } from "./contractForm/useContractFormPrefill";
import { useContractFormState } from "./contractForm/useContractFormState";
import { findActiveContractForBooking, useContract, useCreateContract, useUpdateContract } from "./useContracts";
import type { ContractFormValues } from "../lib/contractFormSchema";

type ContractSubmitContext = {
  id: string | undefined;
  isEdit: boolean;
  bookingId: string | null;
  existing: ReturnType<typeof useContract>["data"];
  customers: ReturnType<typeof useCustomers>["data"];
  form: ReturnType<typeof useContractFormState>["form"];
  createContract: ReturnType<typeof useCreateContract>;
  updateContract: ReturnType<typeof useUpdateContract>;
  navigate: ReturnType<typeof useNavigateTransition>;
};

function canIncludeContractForklift<T extends { id: string; status: string }>(
  forklift: T,
  currentId: string | null,
  bookingForkliftId: string | null,
) {
  return forklift.status === "available" || forklift.id === currentId || forklift.id === bookingForkliftId;
}

function appendSelected<T extends { id: string }>(rows: T[] | undefined, selected: T | null | undefined): T[] {
  const result = [...(rows ?? [])];
  if (selected && !result.some((row) => row.id === selected.id)) result.push(selected);
  return result;
}

function useContractSelections(bookingId: string | null, existing: ReturnType<typeof useContract>["data"]) {
  const { data: listedCustomers } = useCustomers();
  const { data: allForklifts } = useForklifts();
  // A booking can be older than the capped general lists. Fetch its linked
  // customer and forklift directly by ID so prefill stays complete.
  const { data: booking } = useBooking(bookingId ?? undefined);
  const bookingForkliftId = booking?.forklift_id ?? null;
  const { data: selectedForklift } = useForklift(bookingForkliftId ?? existing?.forklift_id ?? undefined);
  const { data: selectedCustomer } = useCustomer(booking?.customer_id ?? existing?.customer_id ?? undefined);
  const customers = useMemo(() => appendSelected(listedCustomers, selectedCustomer), [listedCustomers, selectedCustomer]);
  const currentId = existing?.forklift_id ?? null;
  const forklifts = useMemo(() => appendSelected(allForklifts, selectedForklift)
    .filter((forklift) => canIncludeContractForklift(forklift, currentId, bookingForkliftId)),
  [allForklifts, selectedForklift, currentId, bookingForkliftId]);
  return { customers, forklifts };
}

function submitContract(values: ContractFormValues, context: ContractSubmitContext) {
  const { id, isEdit, bookingId, existing, customers, form, createContract, updateContract, navigate } = context;
  const customer = customers?.find((row) => row.id === values.customer_id);
  if (customer?.rfc?.trim().length === 12 && !customer.representante_legal?.trim()) {
    notifyWarning("Falta el representante legal", {
      description: "Captura el representante legal en la ficha del cliente antes de generar el contrato.",
    });
    return;
  }

  const payload = buildContractPayload(values, bookingId, existing);
  if (isEdit && id) {
    updateContract.mutate({ id, expectedUpdatedAt: existing?.updated_at, ...payload }, {
      onSuccess: () => {
        notifySuccess("Contrato actualizado");
        form.reset(values); // clears isDirty for the guard
        navigate(`/contracts/${id}`);
      },
    });
    return;
  }

  void (async () => {
    // Hallazgo 7: si la reserva ya tiene un contrato no cancelado, se abre
    // ese contrato con un aviso claro en vez de crear un duplicado.
    if (payload.booking_id) {
      try {
        const dup = await findActiveContractForBooking(payload.booking_id);
        if (dup) {
          notifyWarning("Ya existe un contrato para esta reserva", {
            description: `Se abrió el contrato ${dup.contract_number} en lugar de crear otro.`,
          });
          form.reset(values); // libera el guard de cambios sin guardar
          navigate(`/contracts/${dup.id}`);
          return;
        }
      } catch {
        // Si la verificación falla (red), el índice único de la DB respalda
        // y useCreateContract traduce el 23505 a un mensaje claro.
      }
    }
    createContract.mutate(payload, {
      onSuccess: (data) => {
        notifySuccess("Contrato creado");
        form.reset(values);
        navigate(`/contracts/${data.id}`);
      },
    });
  })();
}

export function useContractFormLogic() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigateTransition();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking_id");
  const { data: existing } = useContract(isEdit ? id : undefined);
  const { customers, forklifts } = useContractSelections(bookingId, existing);
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();

  const { form, templateApplied, setTemplateApplied } = useContractFormState(existing, isEdit);

  useContractFormPrefill({
    isEdit, bookingId, form, customers, forklifts,
    templateApplied, setTemplateApplied,
  });

  const isPending = createContract.isPending || updateContract.isPending;

  useUnsavedChangesGuard(form.formState.isDirty && !isPending);

  const onSubmit = (values: ContractFormValues) => submitContract(values, {
    id, isEdit, bookingId, existing, customers, form,
    createContract, updateContract, navigate,
  });

  const handleSubmit = form.handleSubmit(onSubmit);

  return {
    id, isEdit, contractNumber: existing?.contract_number ?? null,
    linkedBookingId: bookingId ?? existing?.booking_id ?? null,
    returnTo: contractFormReturnTo(id, bookingId),
    form, customers, forklifts, isPending, handleSubmit, navigate,
  };
}
