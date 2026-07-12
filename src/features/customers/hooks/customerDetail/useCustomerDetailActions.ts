import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useUpdateCustomer, useDeleteCustomer } from "../customers/useCustomers";
import { useInviteCustomer } from "../customers/useInviteCustomer";
import type { CustomerFormData } from "../../lib/customerFormSchema";

const OPTIONAL_NULL_FIELDS = [
  "email", "phone", "address", "notes", "website", "contact_person",
  "rfc", "regimen_fiscal", "uso_cfdi", "domicilio_fiscal_cp", "representante_legal",
] as const;

function customerFormToUpdate(form: CustomerFormData) {
  const base: Record<string, string | null> = { name: form.name, company: form.name };
  for (const k of OPTIONAL_NULL_FIELDS) {
    const v = form[k as keyof CustomerFormData];
    base[k] = (typeof v === "string" ? v : "") || null;
  }
  return base;
}

interface Params {
  id: string | undefined;
  setInviteOpen: (open: boolean) => void;
  setEditOpen: (open: boolean) => void;
}

export function useCustomerDetailActions({ id, setInviteOpen, setEditOpen }: Params) {
  const navigate = useNavigateTransition();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const inviteCustomer = useInviteCustomer();

  const handleInvite = (email: string) => {
    if (!email || !id) return;
    inviteCustomer.mutate(
      { customerId: id, email },
      { onSuccess: () => setInviteOpen(false) },
    );
  };

  const handleEditSubmit = (form: CustomerFormData) => {
    if (!id) return;
    updateCustomer.mutate({ id, ...customerFormToUpdate(form) }, {
      onSuccess: () => { notifySuccess("Cliente actualizado"); setEditOpen(false); },
    });
  };

  const handleDelete = () => {
    if (!id) return;
    deleteCustomer.mutate(id, {
      onSuccess: () => { notifySuccess("Cliente archivado"); navigate("/customers"); },
    });
  };

  return {
    inviteCustomer, updateCustomer, deleteCustomer,
    handleInvite, handleEditSubmit, handleDelete,
    navigate,
  };
}
