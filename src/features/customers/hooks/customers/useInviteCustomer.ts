import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { customerKeys } from "../../lib/queryKeys";

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
  return useEntityMutation<InviteCustomerVars, InviteCustomerResponse | null>({
    mutationFn: async ({ customerId, email }: InviteCustomerVars) => {
      const res = await supabase.functions.invoke("invite-customer", {
        body: { customer_id: customerId, email },
      });
      if (res.error) throw new Error(res.error.message);
      const data = res.data as InviteCustomerResponse | null;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    invalidateKeys: [customerKeys.all],
    onSuccess: (_data, { email }) => {
      notifySuccess("Invitación enviada", {
        description: `Acceso al portal creado para ${email}`,
      });
    },
    errorTitle: "Error",
  });
}
