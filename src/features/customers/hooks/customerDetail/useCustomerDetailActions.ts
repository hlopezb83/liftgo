import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useUpdateCustomer, useDeleteCustomer } from "@/features/customers/hooks/customers/useCustomers";
import { useInviteCustomer } from "@/features/customers/hooks/customers/useInviteCustomer";
import type { CustomerFormData } from "@/features/customers/lib/customerFormSchema";

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
  inviteEmail: string;
  setInviteOpen: (open: boolean) => void;
  setInviteEmail: (email: string) => void;
  setEditOpen: (open: boolean) => void;
}

export function useCustomerDetailActions({
  id, inviteEmail, setInviteOpen, setInviteEmail, setEditOpen,
}: Params) {
  const navigate = useNavigate();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const inviteCustomer = useInviteCustomer();

  const handleInvite = () => {
    if (!inviteEmail || !id) return;
    inviteCustomer.mutate(
      { customerId: id, email: inviteEmail },
      { onSuccess: () => { setInviteOpen(false); setInviteEmail(""); } },
    );
  };

  const handleEditSubmit = (form: CustomerFormData) => {
    if (!id) return;
    updateCustomer.mutate({ id, ...customerFormToUpdate(form) }, {
      onSuccess: () => { toast.success("Cliente actualizado"); setEditOpen(false); },
    });
  };

  const handleDelete = () => {
    if (!id) return;
    deleteCustomer.mutate(id, {
      onSuccess: () => { toast.success("Cliente eliminado"); navigate("/customers"); },
    });
  };

  return {
    inviteCustomer, updateCustomer, deleteCustomer,
    handleInvite, handleEditSubmit, handleDelete,
    navigate,
  };
}
