import { useQueryClient } from "@tanstack/react-query";
import { bookingKeys } from "@/features/bookings";
import { quoteKeys } from "@/features/quotes";
import { reportKeys } from "@/features/reports";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { buildInvoiceSaveRequest, readSavedInvoice, type SaveInvoiceWithBookingsArgs } from "../../lib/invoiceSaveContract";
import { invoiceBookingKeys, invoiceKeys } from "../../lib/queryKeys";
export type { SaveInvoiceWithBookingsArgs } from "../../lib/invoiceSaveContract";

export function useCreateInvoice(opts?: { onBusinessBlock?: (block: BusinessBlock) => void }) {
  return useEntityMutation({
    // Multi-organización: organization_id lo resuelve la base, el cliente no lo envía.
    mutationFn: async (invoice: Omit<TablesInsert<"invoices">, "invoice_number" | "organization_id">) => {
      const { data: numData, error: numError } = await supabase.rpc("next_draft_invoice_number");
      if (numError) throw numError;
      const { data, error } = await supabase
        .from("invoices")
        // organization_id lo asigna la base (default/trigger), no el formulario.
        .insert({ ...invoice, invoice_number: numData as string } as TablesInsert<"invoices">)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [invoiceKeys.all, reportKeys.all],
    errorTitle: "Error al crear factura",
    // v7.381.1: si el guard de BD `trg_guard_invoice_sale_assignment` rechaza
    // por carrera/estado obsoleto (cotización de venta con equipos sin
    // asignar), la UI muestra el bloque explicable en vez del toast genérico.
    onBusinessBlock: opts?.onBusinessBlock,
  });
}

/**
 * Regresión v7.423.0 (P1): guardado transaccional de factura + reservas.
 * UN solo RPC (`save_invoice_with_bookings`, SECURITY INVOKER — aplican las
 * mismas RLS/triggers/guards del flujo anterior) crea o actualiza la factura
 * Y sincroniza el pivote `invoice_bookings` en UNA transacción de BD, con
 * candados advisory por reserva (misma clave/orden que
 * `create_recurring_invoice`). Si el sync rechaza (reserva+período ya
 * facturados, período fuera del rango de la reserva, etc.), TODO se
 * revierte: no quedan facturas parciales ni huérfanas.
 * El bloqueo optimista se conserva: `expectedVersion` viaja al RPC y un
 * conflicto regresa el mensaje canónico "stale_write…".
 */
export function useSaveInvoiceWithBookings(opts?: { onBusinessBlock?: (block: BusinessBlock) => void }) {
  const queryClient = useQueryClient();
  return useEntityMutation({
    mutationFn: async (args: SaveInvoiceWithBookingsArgs) => {
      const request = buildInvoiceSaveRequest(args);
      const data = await callRpc<unknown>(request.name, request.args);
      try {
        return readSavedInvoice(data, args.invoiceId);
      } catch (error) {
        // The transaction may have committed despite an unreadable receipt.
        // Refresh readers, never retry the write or run success callbacks.
        await Promise.allSettled(
          [invoiceKeys.all, reportKeys.all, invoiceBookingKeys.all, bookingKeys.all, quoteKeys.all].map(
            (queryKey) => queryClient.invalidateQueries({ queryKey }),
          ),
        );
        throw error;
      }
    },
    invalidateKeys: [invoiceKeys.all, reportKeys.all, invoiceBookingKeys.all, bookingKeys.all, quoteKeys.all],
    errorTitle: "Error al guardar factura",
    onBusinessBlock: opts?.onBusinessBlock,
  });
}

/**
 * R4-25: bloqueo optimista (mismo patrón que M-11a en clientes/montacargas).
 * El llamador envía `expectedVersion` — el `version` que tenía la factura al
 * abrir el formulario. Si otro usuario guardó en el intermedio, el trigger
 * `trg_invoices_version` ya incrementó la columna, el UPDATE afecta 0 filas y
 * abortamos en vez de pisar los cambios ajenos. Sin `expectedVersion` se
 * conserva el comportamiento anterior.
 */
export function useUpdateInvoice() {
  return useEntityMutation({
    mutationFn: async ({ id, expectedVersion, ...updates }: TablesUpdate<"invoices"> & {
      id: string;
      expectedVersion?: number | null;
    }) => {
      // GUI-FE-08 (G-DIS-01): sin `.single()`, RLS devolvía 204/0 filas y la
      // UI fingía éxito; con `.single()` lanzaba PGRST116 críptico.
      let q = supabase.from("invoices").update(updates).eq("id", id);
      if (expectedVersion != null) q = q.eq("version", expectedVersion);
      const { data, error } = await q.select();
      if (error) throw error;
      if ((!data || data.length === 0) && expectedVersion != null) {
        // Distinguir conflicto de concurrencia de "sin permisos / inexistente".
        const { data: still } = await supabase
          .from("invoices").select("version").eq("id", id).maybeSingle();
        // R5-17: conflicto real solo si la versión cambió; si coincide, el
        // UPDATE falló por otra causa (RLS/permisos) -> error genérico abajo.
        if (still && still.version !== expectedVersion) {
          throw new Error("stale_write: otro usuario modificó esta factura; recarga y vuelve a intentar");
        }
      }
      assertRowsAffected(data, "Actualizar factura");
      return data[0];
    },

    // `invoiceKeys.all` cubre listas y detalle (jerárquico), evitando invalidar dos veces.
    invalidateKeys: [invoiceKeys.all, reportKeys.all],
    errorTitle: "Error al actualizar factura",
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [invoiceKeys.lists(), reportKeys.all],
    successMsg: "Factura eliminada",
    errorTitle: "Error al eliminar factura",
    onSuccess: (id) => {
      // Removemos el detalle del cache para que `useInvoice(id)` no refetchee
      // una fila borrada (PGRST116).
      queryClient.removeQueries({ queryKey: invoiceKeys.detail(id), exact: true });
    },
  });
}
