import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useUpdateCustomer, useDeleteCustomer } from "@/features/customers/hooks/customers/useCustomers";
import { useInviteCustomer } from "@/features/customers/hooks/customers/useInviteCustomer";
import type { CustomerFormData } from "@/lib/formSchemas";

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
    updateCustomer.mutate({
      id,
      name: form.name, company: form.name,
      email: form.email || null, phone: form.phone || null,
      address: form.address || null, notes: form.notes || null,
      website: form.website || null,
      contact_person: form.contact_person || null,
      rfc: form.rfc || null, regimen_fiscal: form.regimen_fiscal || null,
      uso_cfdi: form.uso_cfdi || null, domicilio_fiscal_cp: form.domicilio_fiscal_cp || null,
      representante_legal: form.representante_legal || null,
    }, {
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
