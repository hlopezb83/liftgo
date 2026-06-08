import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/appFeedback";

interface LinkRfcInput {
  supplierId: string;
  rfc: string;
  overwrite?: boolean;
}

export function useLinkRfcToSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ supplierId, rfc, overwrite }: LinkRfcInput) => {
      const normalized = rfc.trim().toUpperCase();
      if (!normalized) throw new Error("RFC vacío");

      const { data: current, error: fetchErr } = await supabase
        .from("suppliers")
        .select("id, rfc")
        .eq("id", supplierId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!current) throw new Error("Proveedor no encontrado");

      const existing = (current.rfc ?? "").trim();
      if (existing && existing.toUpperCase() === normalized) {
        return { alreadyLinked: true as const };
      }
      if (existing && !overwrite) {
        return { needsConfirm: true as const, currentRfc: existing };
      }

      const { error } = await supabase
        .from("suppliers")
        .update({ rfc: normalized })
        .eq("id", supplierId);
      if (error) throw error;
      return { updated: true as const };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      if ("updated" in result) {
        toast.success("RFC vinculado. Futuras facturas se reconocerán automáticamente.");
      } else if ("alreadyLinked" in result) {
        toast.info("El RFC ya está vinculado a este proveedor");
      }
    },
    onError: (err: Error) => notifyError({ error: err, message: `No se pudo vincular el RFC: ${err.message}` }),
  });
}
