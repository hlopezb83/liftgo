import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import type { SupportListInput } from "@/lib/support/platformSupport.types";
import { withSupportRequest } from "@/lib/support/supportRequest";
import {
  getPlatformSupportFn,
  getPlatformSupportScreenshotFn,
  listPlatformSupportFn,
} from "../lib/platformSupport.functions";
import { platformKeys } from "../lib/queryKeys";

export function usePlatformSupportList(filters: SupportListInput) {
  return useQuery({
    queryKey: platformKeys.support.list(filters),
    queryFn: ({ signal }) =>
      withSupportRequest(
        (requestSignal) => listPlatformSupportFn({ data: filters, signal: requestSignal }),
        signal,
      ),
    staleTime: 30_000,
    retry: false,
  });
}

export function usePlatformSupportDetail(caseId: string) {
  return useInfiniteQuery({
    queryKey: platformKeys.support.detail(caseId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      withSupportRequest(
        (requestSignal) =>
          getPlatformSupportFn({ data: { caseId, before: pageParam }, signal: requestSignal }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 0,
    retry: false,
    refetchInterval: 30_000,
  });
}

export function usePlatformSupportScreenshot(caseId: string) {
  return useMutation({
    mutationFn: () => getPlatformSupportScreenshotFn({ data: { caseId } }),
    meta: { silent: true },
  });
}
