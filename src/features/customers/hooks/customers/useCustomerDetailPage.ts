import { useCustomers } from "./useCustomers";
import { useCustomerSummary } from "./useCustomerSummary";
import { useCustomerProfitability } from "./useCustomerProfitability";
import { useUserRole } from "@/features/users";
import { useCustomerDetailDialogs } from "../customerDetail/useCustomerDetailDialogs";
import { useCustomerDetailActions } from "../customerDetail/useCustomerDetailActions";
import type { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;

const EDIT_FIELDS = [
  "name", "email", "phone", "address", "notes", "website", "contact_person",
  "rfc", "regimen_fiscal", "uso_cfdi", "domicilio_fiscal_cp", "representante_legal",
] as const;

type EditField = (typeof EDIT_FIELDS)[number];

function buildEditInitialData(customer: Customer | undefined): Record<EditField, string> | undefined {
  if (!customer) return undefined;
  const result = {} as Record<EditField, string>;
  for (const k of EDIT_FIELDS) {
    const v = customer[k as keyof Customer];
    result[k] = typeof v === "string" ? v : "";
  }
  return result;
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
