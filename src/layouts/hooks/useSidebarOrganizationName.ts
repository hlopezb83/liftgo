import { useQuery } from "@tanstack/react-query";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";

/** Organization names are readable by every member, including mechanics. */
export function useSidebarOrganizationName() {
  const organizationId = useVerifiedOrganizationId();
  return useQuery({
    queryKey: ["sidebar-organization-name", organizationId],
    enabled: !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!organizationId) throw new Error("Organización no verificada");
      const { data, error } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();
      if (error) throw error;
      return data.name;
    },
  });
}
