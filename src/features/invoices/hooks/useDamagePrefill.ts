import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { useCustomer } from "@/features/customers";
import { chargeableDamageCost } from "@/features/damage";
import { supabase } from "@/integrations/supabase/client";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { notifyWarning } from "@/lib/ui/appFeedback";
import type { Customer } from "./invoiceForm/invoiceFormBuilders";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

interface Params {
  damageId: string | null;
  form: UseFormReturn<InvoiceFormValues>;
  handleCustomerSelect: (id: string, customer?: Customer) => void;
}

const LOADING = "Verificando el daño y su cliente…";
const MISSING = "No se pudo verificar el daño o su cliente. Reintenta la consulta.";
const INTERRUPTED = "Cambiaste el borrador mientras se verificaba el daño. Vuelve a abrir Facturar daño para cargar los datos de origen.";

function useInvoiceDamage(damageId: string | null) {
  const organizationId = useVerifiedOrganizationId();
  const identity = useVerifiedIdentityScope();
  return useQuery({
    queryKey: ["damage_records", "invoice-prefill", identity, damageId],
    enabled: !!damageId && !!organizationId && !!identity,
    queryFn: async ({ signal }) => {
      if (!damageId || !organizationId || !identity) throw new Error(MISSING);
      const { data, error } = await supabase.from("damage_records")
        .select("status,customer_id,estimated_cost,actual_cost,actual_cost_source,repaired_at")
        .eq("id", damageId).eq("organization_id", organizationId)
        .is("deleted_at", null).abortSignal(signal).maybeSingle();
      signal.throwIfAborted();
      if (error) throw error;
      return data;
    },
  });
}

function overridesDamagePrefill(name?: string) {
  return !name || ["customerId", "customerName", "taxRate", "cfdi", "bookingId", "bookingIds", "lineItems"].includes(name)
    || name.startsWith("cfdi.") || name.startsWith("lineItems.");
}

function damageReadBlock(query: ReturnType<typeof useInvoiceDamage>, customer: ReturnType<typeof useCustomer>) {
  if (query.isPending) return LOADING;
  if (query.isError || !query.data) return MISSING;
  if (query.data.status === "invoiced") return "Este daño ya fue facturado.";
  if (query.data.status !== "repaired" || !query.data.repaired_at) return "Primero completa la reparación del daño.";
  if (query.data.customer_id && customer.isPending) return LOADING;
  if (customer.isError || !customer.data || customer.data.id !== query.data.customer_id) return MISSING;
  return null;
}

function applyDamagePrice(
  form: Params["form"], damageId: string,
  damage: NonNullable<ReturnType<typeof useInvoiceDamage>["data"]>,
) {
  const amount = chargeableDamageCost(damage);
  if (amount != null && Number.isFinite(amount) && amount > 0) {
    form.setValue("lineItems", [{
      description: `Cobro de daño (ref. ${damageId.slice(0, 8)})`, quantity: 1, unit_price: amount, total: amount,
    }], { shouldDirty: true });
    return;
  }
  notifyWarning({
    title: amount === 0 ? "Reparación con costo interno de $0" : "Sin costo real de reparación registrado",
    description: "Revisa el precio a cobrar al cliente antes de crear la factura.",
  });
}

/** The draft session is keyed by source; a late lookup cannot replace the user's capture. */
export function useDamagePrefill({ damageId, form, handleCustomerSelect }: Params) {
  const query = useInvoiceDamage(damageId);
  const customerId = query.data?.status === "repaired" ? query.data.customer_id ?? undefined : undefined;
  const customer = useCustomer(customerId);
  const prefilled = useRef(false);
  const interrupted = useRef(false);
  const [state, setState] = useState<"pending" | "applied" | "interrupted">("pending");
  const readBlock = damageId && state !== "applied" ? damageReadBlock(query, customer) : null;
  const block = state === "interrupted" ? INTERRUPTED : readBlock;

  useEffect(() => {
    if (!damageId) return;
    const subscription = form.watch((_values, { name }) => {
      if (prefilled.current || !overridesDamagePrefill(name)) return;
      interrupted.current = true;
      setState("interrupted");
    });
    return () => subscription.unsubscribe();
  }, [damageId, form]);

  const applyPrefill = useEffectEvent(() => {
    if (!damageId || !query.data || !customer.data || readBlock || prefilled.current || interrupted.current) return;
    prefilled.current = true;
    handleCustomerSelect(customer.data.id, customer.data);
    applyDamagePrice(form, damageId, query.data);
    setState("applied");
  });
  useEffect(() => { applyPrefill(); }, [damageId, query.data, customer.data, readBlock]);

  return {
    block: block || (damageId && state === "pending" ? LOADING : null),
    isLoading: !!damageId && state === "pending" && readBlock === LOADING,
    retry: () => {
      if (!damageId || interrupted.current) return;
      void query.refetch();
      if (customerId) void customer.refetch();
    },
  };
}
