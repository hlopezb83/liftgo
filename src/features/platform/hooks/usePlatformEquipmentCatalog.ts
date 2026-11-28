import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import {
  getPlatformEquipmentModelFn,
  getPlatformPartCatalogFn,
  listPlatformEquipmentModelsFn,
  listPlatformPartsCatalogFn,
  savePlatformEquipmentModelFn,
  savePlatformPartCatalogFn,
  setPlatformEquipmentModelActiveFn,
  setPlatformPartCatalogActiveFn,
  type EquipmentModelCatalogInput,
  type PartCatalogInput,
  type PlatformEquipmentModelRow,
  type PlatformPartCatalogRow,
  type SetEquipmentModelCatalogActiveInput,
  type SetPartCatalogActiveInput,
} from "../lib/platformCatalog.functions";
import { platformKeys } from "../lib/queryKeys";

export function usePlatformEquipmentCatalog(enabled: boolean) {
  return useQuery({
    queryKey: platformKeys.equipmentCatalog(),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformEquipmentModelRow[]> =>
      listPlatformEquipmentModelsFn() as Promise<PlatformEquipmentModelRow[]>,
  });
}

export function useGetPlatformEquipmentModel() {
  return useCallback(
    (id: string): Promise<PlatformEquipmentModelRow | null> =>
      getPlatformEquipmentModelFn({ data: { id } }),
    [],
  );
}

export function useSavePlatformEquipmentModel() {
  return useEntityMutation<EquipmentModelCatalogInput, { id: string }>({
    mutationFn: async (input) => savePlatformEquipmentModelFn({ data: input }),
    invalidateKeys: [
      platformKeys.equipmentCatalog(),
      platformKeys.readModels.all,
    ],
    onSuccess: (_result, input) => {
      notifySuccess(input.id ? "Modelo actualizado" : "Modelo global creado");
    },
    errorTitle: "No se pudo guardar el modelo global",
  });
}

export function useSetPlatformEquipmentModelActive() {
  return useEntityMutation<
    SetEquipmentModelCatalogActiveInput,
    { success: true }
  >({
    mutationFn: async (input) =>
      setPlatformEquipmentModelActiveFn({ data: input }),
    invalidateKeys: [
      platformKeys.equipmentCatalog(),
      platformKeys.readModels.all,
    ],
    onSuccess: (_result, input) => {
      notifySuccess(input.active ? "Modelo reactivado en el catálogo LiftGo" : "Modelo desactivado en el catálogo LiftGo");
    },
    errorTitle: "No se pudo cambiar el estado del modelo",
  });
}

export function usePlatformPartsCatalog(enabled: boolean) {
  return useQuery({
    queryKey: platformKeys.partsCatalog(),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformPartCatalogRow[]> =>
      listPlatformPartsCatalogFn() as Promise<PlatformPartCatalogRow[]>,
  });
}

export function useGetPlatformPartCatalog() {
  return useCallback(
    (id: string): Promise<PlatformPartCatalogRow | null> =>
      getPlatformPartCatalogFn({ data: { id } }),
    [],
  );
}

export function useSavePlatformPartCatalog() {
  return useEntityMutation<PartCatalogInput, { id: string }>({
    mutationFn: async (input) => savePlatformPartCatalogFn({ data: input }),
    invalidateKeys: [
      platformKeys.partsCatalog(),
      platformKeys.readModels.all,
    ],
    onSuccess: (_result, input) => {
      notifySuccess(input.id ? "SKU actualizado" : "SKU global creado");
    },
    errorTitle: "No se pudo guardar el SKU global",
  });
}

export function useSetPlatformPartCatalogActive() {
  return useEntityMutation<SetPartCatalogActiveInput, { success: true }>({
    mutationFn: async (input) =>
      setPlatformPartCatalogActiveFn({ data: input }),
    invalidateKeys: [
      platformKeys.partsCatalog(),
      platformKeys.readModels.all,
    ],
    onSuccess: (_result, input) => {
      notifySuccess(input.active ? "SKU reactivado en el catálogo LiftGo" : "SKU desactivado en el catálogo LiftGo");
    },
    errorTitle: "No se pudo cambiar el estado del SKU",
  });
}
