import { useQuery } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import {
  listPlatformEquipmentModelsFn,
  savePlatformEquipmentModelFn,
  setPlatformEquipmentModelActiveFn,
  type EquipmentModelCatalogInput,
  type PlatformEquipmentModelRow,
  type SetEquipmentModelCatalogActiveInput,
} from "@/lib/platformCatalog.functions";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { platformKeys } from "./usePlatformOperator";

export function usePlatformEquipmentCatalog(enabled: boolean) {
  return useQuery({
    queryKey: [...platformKeys.all, "equipment-model-catalog"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformEquipmentModelRow[]> =>
      listPlatformEquipmentModelsFn() as Promise<PlatformEquipmentModelRow[]>,
  });
}

export function useSavePlatformEquipmentModel() {
  return useEntityMutation<EquipmentModelCatalogInput, { id: string }>({
    mutationFn: async (input) => savePlatformEquipmentModelFn({ data: input }),
    invalidateKeys: [[...platformKeys.all, "equipment-model-catalog"]],
    onSuccess: (_result, input) => {
      notifySuccess(input.id ? "Modelo actualizado" : "Modelo global creado");
    },
    errorTitle: "No se pudo guardar el modelo global",
  });
}

export function useSetPlatformEquipmentModelActive() {
  return useEntityMutation<SetEquipmentModelCatalogActiveInput, { success: true }>({
    mutationFn: async (input) => setPlatformEquipmentModelActiveFn({ data: input }),
    invalidateKeys: [[...platformKeys.all, "equipment-model-catalog"]],
    onSuccess: (_result, input) => {
      notifySuccess(input.active ? "Modelo reactivado" : "Modelo desactivado");
    },
    errorTitle: "No se pudo cambiar el estado del modelo",
  });
}
