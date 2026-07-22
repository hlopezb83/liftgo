import { useUserRole } from "@/features/users";
import type { Tables } from "@/integrations/supabase/types";
import { useCustomerDetailActions } from "../customerDetail/useCustomerDetailActions";
import { useCustomerDetailDialogs } from "../customerDetail/useCustomerDetailDialogs";
import { useCustomerProfitability } from "./useCustomerProfitability";
import { useCustomer } from "./useCustomers";
import { useCustomerSummary } from "./useCustomerSummary";

type Customer = Tables<"customers">;

const EDIT_FIELDS = [
  "name", "email", "phone", "address", "notes", "website", "contact_person",
  "rfc", "regimen_fiscal", "uso_cfdi", "domicilio_fiscal_cp", "representante_legal",
] as const;

type EditField = (typeof EDIT_FIELDS)[number];

function buildEditInitialData(customer: Customer | undefined | null): Record<EditField, string> | undefined {
  if (!customer) return undefined;
  const result = {} as Record<EditField, string>;
  for (const k of EDIT_FIELDS) {
    const v = customer[k as keyof Customer];
    result[k] = typeof v === "string" ? v : "";
  }
  return result;
}

export function useCustomerDetailPage(id: string | undefined) {
  const { data: customer, isLoading } = useCustomer(id);
  const { data: summary } = useCustomerSummary(id);
  const { data: profitability } = useCustomerProfitability(id);
  const { data: role } = useUserRole();

  const dialogs = useCustomerDetailDialogs();
  const actions = useCustomerDetailActions({
    id,
    setInviteOpen: dialogs.setInviteOpen,
    setEditOpen: dialogs.setEditOpen,
  });

  const bookings = summary?.bookings ?? [];
  const invoices = summary?.invoices ?? [];

  // R7-21.5: reservas activas = estados que impiden archivar el cliente.
  // Coherente con la máquina de estados de bookings (confirmed/active).
  const ACTIVE_BOOKING_STATUSES = new Set(["confirmed", "active"]);
  const activeBookingsCount = bookings.filter((b) =>
    ACTIVE_BOOKING_STATUSES.has(b.status),
  ).length;

  const totalInvoiced = Number(summary?.totals.total_invoiced ?? 0);
  const totalPaid = Number(summary?.totals.total_paid ?? 0);
  const outstanding = totalInvoiced - totalPaid;
  const hasPortalAccess = !!customer?.user_id;
  const hasDependencies = bookings.length > 0 || invoices.length > 0;

  return {
    isLoading, customer: customer ?? undefined, summary, profitability, role,
    bookings, invoices, activeBookingsCount,
    totalInvoiced, totalPaid, outstanding,
    hasPortalAccess, hasDependencies,
    editInitialData: buildEditInitialData(customer),
    ...dialogs,
    ...actions,
  };
}
