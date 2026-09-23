import { useQuery } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import {
  assignPlatformLegalTemplateVersionFn,
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
} from "@/lib/platformLegalTemplates.functions";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { platformKeys } from "./usePlatformOperator";

const legalKeys = {
  all: [...platformKeys.all, "legal-templates"] as const,
  versions: (definitionId: string) => [...legalKeys.all, definitionId, "versions"] as const,
  assignments: (definitionId: string) => [...legalKeys.all, definitionId, "assignments"] as const,
};

export function usePlatformLegalTemplates(enabled: boolean) {
  return useQuery({
    queryKey: legalKeys.all,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformLegalTemplateRow[]> =>
      listPlatformLegalTemplatesFn() as Promise<PlatformLegalTemplateRow[]>,
  });
}

export function usePlatformLegalTemplateVersions(definitionId: string, enabled: boolean) {
  return useQuery({
    queryKey: legalKeys.versions(definitionId),
    enabled: enabled && !!definitionId,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformLegalTemplateVersion[]> =>
      listPlatformLegalTemplateVersionsFn({ data: { definition_id: definitionId } }) as Promise<PlatformLegalTemplateVersion[]>,
  });
}

export function usePlatformLegalTemplateAssignments(definitionId: string, enabled: boolean) {
  return useQuery({
    queryKey: legalKeys.assignments(definitionId),
    enabled: enabled && !!definitionId,
    staleTime: 15_000,
    queryFn: async (): Promise<PlatformLegalTemplateAssignment[]> =>
      listPlatformLegalTemplateAssignmentsFn({ data: { definition_id: definitionId } }) as Promise<PlatformLegalTemplateAssignment[]>,
  });
}

export function usePublishPlatformLegalTemplateVersion() {
  return useEntityMutation<PublishLegalTemplateVersionInput, PublishLegalTemplateVersionResult>({
    mutationFn: async (input) => publishPlatformLegalTemplateVersionFn({ data: input }),
    invalidateKeys: [legalKeys.all],
    invalidateKeysFn: (_result, input) => [
      legalKeys.versions(input.definition_id),
      legalKeys.assignments(input.definition_id),
    ],
    onSuccess: (result) => { notifySuccess(`Versión legal ${result.version} publicada`); },
    errorTitle: "No se pudo publicar la versión legal",
  });
}

export function useAssignPlatformLegalTemplateVersion() {
  return useEntityMutation<AssignLegalTemplateVersionInput, { success: true }>({
    mutationFn: async (input) => assignPlatformLegalTemplateVersionFn({ data: input }),
    invalidateKeys: [legalKeys.all],
    invalidateKeysFn: (_result, input) => [legalKeys.assignments(input.definition_id)],
    successMsg: "Versión legal asignada",
    errorTitle: "No se pudo asignar la versión legal",
  });
}
