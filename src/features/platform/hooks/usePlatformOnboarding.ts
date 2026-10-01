import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { createOrganizationFn } from "@/lib/platformAdmin.functions";
import {
  listPendingOnboardingFn,
  resumePlatformOnboardingFn,
} from "@/lib/platformOnboarding.functions";
import type {
  PlatformOnboardingInput,
  PlatformOnboardingResult,
} from "@/lib/platformOnboarding.types";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { platformKeys } from "./usePlatformOperator";

export function usePendingPlatformOnboarding(offset: number) {
  return useQuery({
    queryKey: [...platformKeys.all, "pending-onboarding", offset],
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: () => listPendingOnboardingFn({ data: { offset } }),
  });
}

function useOnboardingMutation<T>(
  mutationFn: (input: T) => Promise<PlatformOnboardingResult>,
) {
  const client = useQueryClient();
  return useEntityMutation<T, PlatformOnboardingResult>({
    mutationFn,
    invalidateKeys: [platformKeys.all],
    onError: () => {
      void client.invalidateQueries({ queryKey: platformKeys.all });
    },
    onSuccess: (result) => {
      notifySuccess(result.success ? "Empresa habilitada" : "Alta guardada", {
        description: result.success
          ? `Primer administrador: ${result.admin_email}`
          : result.message,
      });
    },
    errorTitle: "No se pudo completar el alta",
  });
}

export function useCreateOrganization() {
  return useOnboardingMutation<PlatformOnboardingInput>((input) =>
    createOrganizationFn({ data: input }),
  );
}
export function useResumePlatformOnboarding() {
  return useOnboardingMutation<{ request_id: string }>((input) =>
    resumePlatformOnboardingFn({ data: input }),
  );
}
