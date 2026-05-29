import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { parseJsonbArray } from "@/lib/lineItems";
import { toast } from "sonner";
import { useState } from "react";

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
  const queryClient = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // Fetch all versions for the selector
  const versionsQuery = useQuery({
    queryKey: ["user-manual-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_manual")
        .select("id, version, generated_at")
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; version: string; generated_at: string }[];
    },
  });

  // Fetch the selected (or latest) manual
  const query = useQuery({
    queryKey: ["user-manual", selectedVersion],
    queryFn: async () => {
      let q = supabase
        .from("user_manual")
        .select("*");

      if (selectedVersion) {
        q = q.eq("id", selectedVersion);
      } else {
        q = q.order("generated_at", { ascending: false }).limit(1);
      }

      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        content: parseJsonbArray<ManualSection>(data.content),
      } as UserManual;
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
      setSelectedVersion(null);
      queryClient.invalidateQueries({ queryKey: ["user-manual"] });
      queryClient.invalidateQueries({ queryKey: ["user-manual-versions"] });
      toast.success("Manual generado", { description: "El manual de usuario se generó exitosamente." });
    },
    onError: (error: Error) => {
      notifyError({ title: "Error", error: error });
    },
  });

  return {
    manual: query.data,
    isLoading: query.isLoading,
    generate: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
    versions: versionsQuery.data ?? [],
    selectedVersion,
    setSelectedVersion,
  };
}
