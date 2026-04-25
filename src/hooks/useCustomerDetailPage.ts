import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useCustomers, useUpdateCustomer, useDeleteCustomer } from "@/hooks/useCustomers";
import { useCustomerSummary } from "@/hooks/useCustomerSummary";
import { useCustomerProfitability } from "@/hooks/useCustomerProfitability";
import { useInviteCustomer } from "@/hooks/useInviteCustomer";
import { useUserRole } from "@/hooks/useUserRole";
import type { CustomerFormData } from "@/lib/formSchemas";

export function useCustomerDetailPage(id: string | undefined) {
  const navigate = useNavigate();
  const { data: customers, isLoading } = useCustomers();
  const { data: summary } = useCustomerSummary(id);
  const { data: profitability } = useCustomerProfitability(id);
  const { data: role } = useUserRole();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const inviteCustomer = useInviteCustomer();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const customer = customers?.find((c) => c.id === id);
  const bookings = summary?.bookings ?? [];
  const invoices = summary?.invoices ?? [];

  const totalInvoiced = Number(summary?.totals.total_invoiced ?? 0);
  const totalPaid = Number(summary?.totals.total_paid ?? 0);
  const outstanding = totalInvoiced - totalPaid;
  const hasPortalAccess = !!customer?.user_id;
  const hasDependencies = bookings.length > 0 || invoices.length > 0;

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

  const editInitialData = customer ? {
    name: customer.name || "",
    email: customer.email || "",
    phone: customer.phone || "",
    address: customer.address || "",
    notes: customer.notes || "",
    website: customer.website || "",
    contact_person: customer.contact_person || "",
    rfc: customer.rfc || "",
    regimen_fiscal: customer.regimen_fiscal || "",
    uso_cfdi: customer.uso_cfdi || "",
    domicilio_fiscal_cp: customer.domicilio_fiscal_cp || "",
    representante_legal: customer.representante_legal || "",
  } : undefined;

  return {
    isLoading, customer, summary, profitability, role,
    bookings, invoices,
    totalInvoiced, totalPaid, outstanding,
    hasPortalAccess, hasDependencies,
    editInitialData,
    inviteOpen, setInviteOpen, inviteEmail, setInviteEmail,
    editOpen, setEditOpen,
    deleteOpen, setDeleteOpen,
    inviteCustomer, updateCustomer, deleteCustomer,
    handleInvite, handleEditSubmit, handleDelete,
    navigate,
  };
}
