import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseJsonbArray } from "@/lib/domain/lineItems";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { userManualKeys, userManualVersionKeys } from "../lib/queryKeys";

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

export const userManualVersionQueries = defineEntityQueries<
  typeof userManualVersionKeys.all[number],
  { id: string; version: string; generated_at: string }[],
  never
>("user-manual-versions", {
  list: () => async () => {
    const { data, error } = await supabase
      .from("user_manual")
      .select("id, version, generated_at")
      .order("generated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as { id: string; version: string; generated_at: string }[];
  },
});

export const userManualQueries = defineEntityQueries<
  typeof userManualKeys.all[number],
  UserManual | null,
  never
>("user-manual", {
  list: (filter) => async () => {
    const selectedVersion = (filter?.selectedVersion as string | null | undefined) ?? null;
    // v7.216.0 (C6): columnas explícitas.
    const sel = (s: string): string => s;
    let q = supabase
      .from("user_manual")
      .select(sel("id, version, content, generated_at, updated_at"));

    if (selectedVersion) {
      q = q.eq("id", selectedVersion);
    } else {
      q = q.order("generated_at", { ascending: false }).limit(1);
    }

    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as { id: string; version: string; content: unknown; generated_at: string; updated_at: string };
    return {
      ...row,
      content: parseJsonbArray<ManualSection>(row.content as never),
    } as UserManual;
  },
});

export function useUserManual() {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // Fetch all versions for the selector
  const versionsQuery = useQuery(userManualVersionQueries.list());

  // Fetch the selected (or latest) manual
  const query = useQuery(userManualQueries.list({ selectedVersion }));

  const generateMutation = useEntityMutation({
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
    invalidateKeys: [userManualKeys.all, userManualVersionKeys.all],
    errorTitle: "Error",
    onSuccess: () => {
      setSelectedVersion(null);
      notifySuccess("Manual generado", { description: "El manual de usuario se generó exitosamente." });
    },
  });

  return {
    manual: query.data,
    isLoading: query.isLoading,
    generate: () => generateMutation.mutate(undefined),
    isGenerating: generateMutation.isPending,
    versions: versionsQuery.data ?? [],
    selectedVersion,
    setSelectedVersion,
  };
}
