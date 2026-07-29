import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
export type { DamageRecord } from "@/types/rental";

type DamageListRow = Awaited<ReturnType<typeof fetchDamageList>>[number];

async function fetchDamageList() {
  const { data, error } = await supabase
    .from("damage_records")
    .select("*, forklifts(name, model), customers(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const damageRecordQueries = defineEntityQueries<"damage_records", DamageListRow[], never>(
  "damage_records",
  {
    list: () => fetchDamageList,
  },
);

export function useDamageRecords() {
  return useQuery(damageRecordQueries.list());
}

export function useCreateDamageRecord() {
  return useEntityMutation({
    mutationFn: async (record: TablesInsert<"damage_records">) => {
      const { data, error } = await supabase.from("damage_records").insert(record).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [damageRecordQueries.keys.all],
    errorTitle: "Error al crear registro de daño",
  });
}

export function useUpdateDamageRecord() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"damage_records"> & { id: string }) => {
      const { data, error } = await supabase.from("damage_records").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [damageRecordQueries.keys.all],
    errorTitle: "Error al actualizar registro de daño",
  });
}

/** Soft delete vía RPC (DB3-14a): restaura el estado coherente del montacargas
 *  y registra el archivo en status_logs. La RPC exige invoice_id o repaired. */
export function useArchiveDamageRecord() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      await callRpc<void>("soft_delete_damage_record", { p_damage_id: id });
      return id;
    },
    invalidateKeys: [damageRecordQueries.keys.all],
    errorTitle: "Error al archivar registro de daño",
  });
}
