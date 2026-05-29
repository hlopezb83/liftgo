import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("operating_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operating_expenses"] });
      toast.success("Gasto eliminado");
    },
    onError: () => notifyError({ message: "Error al eliminar gasto" }),
  });
}
