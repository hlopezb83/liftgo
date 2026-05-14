import { useCustomers } from "@/hooks/useCustomers";
import { useCustomerSummary } from "@/hooks/useCustomerSummary";
import { useCustomerProfitability } from "@/hooks/useCustomerProfitability";
import { useUserRole } from "@/hooks/useUserRole";
import { useCustomerDetailDialogs } from "@/features/customers/hooks/customerDetail/useCustomerDetailDialogs";
import { useCustomerDetailActions } from "@/features/customers/hooks/customerDetail/useCustomerDetailActions";
import type { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;

function buildEditInitialData(customer: Customer | undefined) {
  if (!customer) return undefined;
  return {
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
  };
}

export function useCustomerDetailPage(id: string | undefined) {
  const { data: customers, isLoading } = useCustomers();
  const { data: summary } = useCustomerSummary(id);
  const { data: profitability } = useCustomerProfitability(id);
  const { data: role } = useUserRole();

  const dialogs = useCustomerDetailDialogs();
  const actions = useCustomerDetailActions({
    id,
    inviteEmail: dialogs.inviteEmail,
    setInviteOpen: dialogs.setInviteOpen,
    setInviteEmail: dialogs.setInviteEmail,
    setEditOpen: dialogs.setEditOpen,
  });

  const customer = customers?.find((c) => c.id === id);
  const bookings = summary?.bookings ?? [];
  const invoices = summary?.invoices ?? [];

  const totalInvoiced = Number(summary?.totals.total_invoiced ?? 0);
  const totalPaid = Number(summary?.totals.total_paid ?? 0);
  const outstanding = totalInvoiced - totalPaid;
  const hasPortalAccess = !!customer?.user_id;
  const hasDependencies = bookings.length > 0 || invoices.length > 0;

  return {
    isLoading, customer, summary, profitability, role,
    bookings, invoices,
    totalInvoiced, totalPaid, outstanding,
    hasPortalAccess, hasDependencies,
    editInitialData: buildEditInitialData(customer),
    ...dialogs,
    ...actions,
  };
}
