import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import {
  assignPlatformLegalTemplateVersionFn,
  getPlatformLegalTemplateFn,
  listPlatformLegalTemplateAssignmentsFn,
  listPlatformLegalTemplatesFn,
  listPlatformLegalTemplateVersionsFn,
  publishPlatformLegalTemplateVersionFn,
  type AssignLegalTemplateVersionInput,
  type PlatformLegalTemplateAssignment,
  type PlatformLegalTemplateRow,
  type PlatformLegalTemplateVersion,
  type PublishLegalTemplateVersionInput,
  type PublishLegalTemplateVersionResult,
} from "../lib/platformLegalTemplates.functions";
import { platformKeys } from "../lib/queryKeys";

export function usePlatformLegalTemplates(enabled: boolean) {
  return useQuery({
    queryKey: platformKeys.legalTemplates.all,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformLegalTemplateRow[]> =>
      listPlatformLegalTemplatesFn() as Promise<PlatformLegalTemplateRow[]>,
  });
}

export function useGetPlatformLegalTemplate() {
  return useCallback(
    (id: string): Promise<PlatformLegalTemplateRow | null> =>
      getPlatformLegalTemplateFn({ data: { id } }),
    [],
  );
}

export function usePlatformLegalTemplateVersions(
  definitionId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: platformKeys.legalTemplates.versions(definitionId),
    enabled: enabled && !!definitionId,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformLegalTemplateVersion[]> =>
      listPlatformLegalTemplateVersionsFn({
        data: { definition_id: definitionId },
      }) as Promise<PlatformLegalTemplateVersion[]>,
  });
}

export function usePlatformLegalTemplateAssignments(
  definitionId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: platformKeys.legalTemplates.assignments(definitionId),
    enabled: enabled && !!definitionId,
    staleTime: 15_000,
    queryFn: async (): Promise<PlatformLegalTemplateAssignment[]> =>
      listPlatformLegalTemplateAssignmentsFn({
        data: { definition_id: definitionId },
      }) as Promise<PlatformLegalTemplateAssignment[]>,
  });
}

export function usePublishPlatformLegalTemplateVersion() {
  return useEntityMutation<
    PublishLegalTemplateVersionInput,
    PublishLegalTemplateVersionResult
  >({
    mutationFn: async (input) =>
      publishPlatformLegalTemplateVersionFn({ data: input }),
    invalidateKeys: [platformKeys.legalTemplates.all, platformKeys.readModels.all],
    invalidateKeysFn: (_result, input) => [
      platformKeys.legalTemplates.versions(input.definition_id),
      platformKeys.legalTemplates.assignments(input.definition_id),
    ],
    onSuccess: (result) => {
      notifySuccess(`Versión legal ${result.version} publicada`);
    },
    errorTitle: "No se pudo publicar la versión legal",
  });
}

export function useAssignPlatformLegalTemplateVersion() {
  return useEntityMutation<AssignLegalTemplateVersionInput, { success: true }>({
    mutationFn: async (input) =>
      assignPlatformLegalTemplateVersionFn({ data: input }),
    invalidateKeys: [platformKeys.legalTemplates.all, platformKeys.readModels.all],
    invalidateKeysFn: (_result, input) => [
      platformKeys.legalTemplates.assignments(input.definition_id),
    ],
    successMsg: "Versión legal asignada",
    errorTitle: "No se pudo asignar la versión legal",
  });
}
