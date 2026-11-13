import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export type AddMaintenancePartInput = {
  maintenance_log_id: string;
  part_id: string;
  quantity_used: number;
  /** Compatibility with older forms; the server owns both costs. */
  cost_at_time?: number;
  currentLogCost?: number;
};

const receiptSchema = z.object({
  // PostgreSQL accepts historical UUIDs outside RFC version/variant constraints.
  id: z.guid(),
  organization_id: z.guid(),
  maintenance_log_id: z.guid(),
  part_id: z.guid(),
  quantity_used: z.number().int().positive(),
  cost_at_time: z.number().finite().nonnegative(),
});
export type MaintenancePartReceipt = z.infer<typeof receiptSchema>;

export class MaintenancePartUnconfirmedError extends Error {
  constructor(cause?: unknown) {
    super("No se pudo confirmar el consumo. Recarga las refacciones utilizadas antes de volver a agregar unidades.", { cause });
    this.name = "MaintenancePartUnconfirmedError";
  }
}

// Local contract for migration0146; generated Supabase types stay unchanged.
type ConsumptionRpc = (name: "add_maintenance_part_quantity", args: {
  p_maintenance_log_id: string;
  p_part_id: string;
  p_quantity: number;
}) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

export async function addMaintenancePartQuantity(input: AddMaintenancePartInput): Promise<MaintenancePartReceipt> {
  if (!Number.isSafeInteger(input.quantity_used) || input.quantity_used <= 0) {
    throw Object.assign(new Error("La cantidad adicional debe ser un entero mayor que cero."), { code: "23514" });
  }
  const rpc = supabase.rpc.bind(supabase) as unknown as ConsumptionRpc;
  const result = await Promise.resolve(rpc("add_maintenance_part_quantity", {
    p_maintenance_log_id: input.maintenance_log_id,
    p_part_id: input.part_id,
    p_quantity: input.quantity_used,
  })).catch((error: unknown) => { throw new MaintenancePartUnconfirmedError(error); });
  const { data, error } = result;
  if (error) {
    if (!error.code) throw new MaintenancePartUnconfirmedError(error);
    throw error;
  }
  const parsed = receiptSchema.safeParse(data);
  if (!parsed.success || parsed.data.maintenance_log_id !== input.maintenance_log_id
    || parsed.data.part_id !== input.part_id || parsed.data.quantity_used < input.quantity_used) {
    throw new MaintenancePartUnconfirmedError();
  }
  return parsed.data;
}
