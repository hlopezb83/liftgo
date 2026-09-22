import { useQuery } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import {
  listPlatformEquipmentModelsFn,
  listPlatformPartsCatalogFn,
  savePlatformPartCatalogFn,
  savePlatformEquipmentModelFn,
  setPlatformEquipmentModelActiveFn,
  setPlatformPartCatalogActiveFn,
  type EquipmentModelCatalogInput,
  type PartCatalogInput,
  type PlatformEquipmentModelRow,
  type PlatformPartCatalogRow,
  type SetEquipmentModelCatalogActiveInput,
  type SetPartCatalogActiveInput,
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

export function usePlatformPartsCatalog(enabled: boolean) {
  return useQuery({
    queryKey: [...platformKeys.all, "parts-catalog"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformPartCatalogRow[]> =>
      listPlatformPartsCatalogFn() as Promise<PlatformPartCatalogRow[]>,
  });
}

export function useSavePlatformPartCatalog() {
  return useEntityMutation<PartCatalogInput, { id: string }>({
    mutationFn: async (input) => savePlatformPartCatalogFn({ data: input }),
    invalidateKeys: [[...platformKeys.all, "parts-catalog"]],
    onSuccess: (_result, input) => {
      notifySuccess(input.id ? "SKU actualizado" : "SKU global creado");
    },
    errorTitle: "No se pudo guardar el SKU global",
  });
}

export function useSetPlatformPartCatalogActive() {
  return useEntityMutation<SetPartCatalogActiveInput, { success: true }>({
    mutationFn: async (input) => setPlatformPartCatalogActiveFn({ data: input }),
    invalidateKeys: [[...platformKeys.all, "parts-catalog"]],
    onSuccess: (_result, input) => {
      notifySuccess(input.active ? "SKU reactivado" : "SKU desactivado");
    },
    errorTitle: "No se pudo cambiar el estado del SKU",
  });
}
