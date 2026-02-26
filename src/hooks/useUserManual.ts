import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ManualSection {
  title: string;
  icon: string;
  content: string;
}

export interface UserManual {
  id: string;
  version: string;
  content: ManualSection[];
  generated_at: string;
  updated_at: string;
}

export function useUserManual() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["user-manual"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_manual")
        .select("*")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data as unknown as UserManual;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No autenticado");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-manual`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(err.error || `Error ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-manual"] });
      toast({ title: "Manual generado", description: "El manual de usuario se generó exitosamente." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return {
    manual: query.data,
    isLoading: query.isLoading,
    generate: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
  };
}
