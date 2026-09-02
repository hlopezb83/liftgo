import { useState } from "react";
import { useUserRole } from "@/features/users";
import type { Tables } from "@/integrations/supabase/types";
import { isValidUuid } from "@/lib/isValidUuid";
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

function buildEditInitialData(
  customer: Customer | undefined | null,
): (Record<EditField, string> & { tax_rate: string }) | undefined {
  if (!customer) return undefined;
  const result = {} as Record<EditField, string>;
  for (const k of EDIT_FIELDS) {
    const v = customer[k as keyof Customer];
    result[k] = typeof v === "string" ? v : "";
  }
  // FIX-3: la tasa de IVA se edita como texto (vacío = usar el 16% default).
  const rate = (customer as { tax_rate?: number | string | null }).tax_rate;
  return { ...result, tax_rate: rate == null ? "" : String(rate) };
}


type CustomerSummary = NonNullable<ReturnType<typeof useCustomerSummary>["data"]>;

// R7-21.5: reservas activas = estados que impiden archivar el cliente.
// Coherente con la máquina de estados de bookings (confirmed/active).
const ACTIVE_BOOKING_STATUSES = new Set(["confirmed", "active"]);

function computeCustomerTotals(summary: CustomerSummary | undefined) {
  const bookings = summary?.bookings ?? [];
  const invoices = summary?.invoices ?? [];
  const activeBookingsCount = bookings.filter((b) => ACTIVE_BOOKING_STATUSES.has(b.status)).length;
  const totalInvoiced = Number(summary?.totals.total_invoiced ?? 0);
  const totalPaid = Number(summary?.totals.total_paid ?? 0);
  // Saldo pendiente canónico: mismo cálculo que impone el backend al archivar
  // (`customer_outstanding_balance`). Fallback defensivo al neto facturado.
  const outstanding = summary?.totals.outstanding_revenue != null
    ? Number(summary.totals.outstanding_revenue)
    : totalInvoiced - totalPaid - Number(summary?.totals.total_credited ?? 0);
  return {
    bookings, invoices, activeBookingsCount, totalInvoiced, totalPaid, outstanding,
    hasDependencies: bookings.length > 0 || invoices.length > 0,
  };
}

export function useCustomerDetailPage(id: string | undefined) {
  // R9 (defensa): si el segmento de ruta no es un UUID válido (p. ej. "new"
  // colado por una ruta mal armada) no disparamos ningún fetch — se muestra
  // el estado "Cliente no encontrado" en vez de un error SQL crudo.
  const validId = isValidUuid(id) ? id : undefined;
  // E3: `isError`/`refetch` se exponen para que la página distinga "falló la
  // consulta" de "el cliente no existe" (antes ambos caían en el mismo vacío).
  const { data: customer, isLoading, isError, refetch } = useCustomer(validId);
  const { data: summary } = useCustomerSummary(validId);
  const { data: profitability } = useCustomerProfitability(validId);
  const { data: role } = useUserRole();

  const dialogs = useCustomerDetailDialogs();
  // FIX R6-06: snapshot de `customer.version` al ABRIR el diálogo de edición
  // (patrón R5-09 de facturas). Sin él, un refetch de `useCustomer` mientras el
  // diálogo está abierto actualiza `customer.version` en vivo y el guardado
  // pisa cambios ajenos (lost update).
  // useState (no ref): el snapshot sólo se escribe en el handler de apertura
  // del diálogo y se lee como estado — leer un ref durante render está
  // prohibido por react-hooks/refs.
  const [customerVersion, setCustomerVersion] = useState<number | null>(null);
  const setEditOpen = (open: boolean) => {
    if (open) setCustomerVersion(customer?.version ?? null);
    dialogs.setEditOpen(open);
  };
  const actions = useCustomerDetailActions({
    id,
    // M-11a: versión congelada al abrir → bloqueo optimista en el guardado.
    expectedVersion: customerVersion,
    setInviteOpen: dialogs.setInviteOpen,
    setEditOpen: dialogs.setEditOpen,
  });

  const totals = computeCustomerTotals(summary);
  const { bookings, invoices, activeBookingsCount, totalInvoiced, totalPaid, outstanding, hasDependencies } = totals;
  const hasPortalAccess = !!customer?.user_id;

  return {
    isLoading, isError, refetch, customer: customer ?? undefined, summary, profitability, role,
    bookings, invoices, activeBookingsCount,
    totalInvoiced, totalPaid, outstanding,
    hasPortalAccess, hasDependencies,
    editInitialData: buildEditInitialData(customer),
    ...dialogs,
    setEditOpen,
    ...actions,
  };
}
