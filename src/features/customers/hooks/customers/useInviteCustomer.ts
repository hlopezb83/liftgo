import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { customerKeys } from "@/features/customers/lib/queryKeys";
import { toast } from "sonner";

interface InviteCustomerVars {
  customerId: string;
  email: string;
}

interface InviteCustomerResponse {
  error?: string;
}

/**
 * Crea acceso al portal de clientes mediante el edge function `invite-customer`.
 */
export function useInviteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ customerId, email }: InviteCustomerVars) => {
      const res = await supabase.functions.invoke("invite-customer", {
        body: { customer_id: customerId, email },
      });
      if (res.error) throw new Error(res.error.message);
      const data = res.data as InviteCustomerResponse | null;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, { email }) => {
      toast.success("Invitación enviada", {
        description: `Acceso al portal creado para ${email}`,
      });
      queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
    onError: (err: unknown) => {
      notifyError({ error: err, title: "Error", description: err instanceof Error ? err.message : "Error desconocido", });
    },
  });
}
