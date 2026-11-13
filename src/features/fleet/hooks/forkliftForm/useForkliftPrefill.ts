import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/feedback/useConfirm";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import type { Tables } from "@/integrations/supabase/types";
import { toStr, toNumStr } from "@/lib/coerce";
import { notifyError } from "@/lib/ui/appFeedback";
import type { ForkliftFormData } from "../../lib/forkliftFormSchema";
import type { UseFormReturn } from "react-hook-form";

type ExistingForklift = Tables<"forklifts"> | null | undefined;
type ReloadResult = { data?: ExistingForklift; error?: unknown };

function reloadedRecord(result: ReloadResult, id: string) {
  if (result.error) throw result.error;
  if (!result.data || result.data.id !== id) throw new Error("El equipo ya no está disponible. La captura se conservó.");
  return result.data;
}

function mapForkliftToForm(f: Tables<"forklifts">): ForkliftFormData {
  return {
    name: f.name,
    model: f.model,
    manufacturer: toStr(f.manufacturer),
    year: toNumStr(f.year),
    capacity_kg: toNumStr(f.capacity_kg),
    mast_height_m: toNumStr(f.mast_height_m),
    fuel_type: toStr(f.fuel_type, "Diesel"),
    serial_number: toStr(f.serial_number),
    status: f.status,
    daily_rate: toNumStr(f.daily_rate),
    weekly_rate: toNumStr(f.weekly_rate),
    monthly_rate: toNumStr(f.monthly_rate),
    acquisition_cost: toNumStr(f.acquisition_cost),
    notes: toStr(f.notes),
    insurance_provider: toStr(f.insurance_provider),
    insurance_policy_number: toStr(f.insurance_policy_number),
    insurance_expiry: toStr(f.insurance_expiry),
    insurance_cost: toNumStr(f.insurance_cost),
  };
}

export function useForkliftPrefill(
  id: string | undefined,
  existing: ExistingForklift,
  form: UseFormReturn<ForkliftFormData>,
  catalogsReady: boolean,
  refetch: () => Promise<ReloadResult>,
) {
  const [snapshot, setSnapshot] = useState<ExistingForklift>(null);
  const [reloadingId, setReloadingId] = useState<string | null>(null);
  const confirm = useConfirm();
  const activeId = useRef(id);
  const busy = useRef<{ id: string } | null>(null);
  useEffect(() => {
    activeId.current = id;
    return () => { activeId.current = undefined; };
  }, [id]);
  const applyRecord = (record: NonNullable<ExistingForklift>) => {
    form.reset(mapForkliftToForm(record));
    setSnapshot(record);
  };
  usePrefillEffect(() => {
    // R14-C: NO resetear hasta que equipmentModels resolvió. Si el reset llega
    // antes, los Select quedan con value sin items registrados y Radix emite
    // onValueChange("") que vacía fabricante/modelo/combustible.
    if (!id || existing?.id !== id || !catalogsReady || snapshot?.id === id) return;
    applyRecord(existing);
  }, [id, existing, catalogsReady, snapshot?.id]);

  const reload = async () => {
    if (!id || busy.current?.id === id || !catalogsReady) return;
    const request = { id };
    busy.current = request;
    setReloadingId(id);
    const isCurrent = () => activeId.current === id && busy.current === request;
    try {
      if (form.formState.isDirty && !await confirm({
        title: "¿Recargar los datos del equipo?",
        description: "Se descartarán tus cambios sin guardar y se cargará la versión actual.",
        confirmLabel: "Recargar y descartar", cancelLabel: "Seguir editando", destructive: true,
      })) return;
      if (!isCurrent()) return;
      const result = await refetch();
      if (!isCurrent()) return;
      applyRecord(reloadedRecord(result, id));
    } catch (error) {
      if (activeId.current === id) notifyError({ error, title: "No se pudo recargar el equipo" });
    } finally {
      if (busy.current === request) {
        busy.current = null;
        setReloadingId(null);
      }
    }
  };
  const record = snapshot?.id === id ? snapshot : null;
  return { record, reload, isReloading: !!id && reloadingId === id,
    hasServerChanges: !!record && existing?.id === id && existing?.updated_at !== record.updated_at };
}
