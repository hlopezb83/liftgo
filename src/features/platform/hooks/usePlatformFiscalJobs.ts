import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { listPlatformFiscalActionsFn } from "../lib/platformFiscalActions.functions";
import { getPlatformFiscalJobFn, listPlatformFiscalJobsFn } from "../lib/platformFiscalJobs.functions";
import { platformKeys } from "../lib/queryKeys";
import type { FiscalAction } from "../lib/platformFiscalActions.types";
import type { FiscalJobsInput } from "../lib/platformFiscalJobs.types";

export function usePlatformFiscalJobs(filters: FiscalJobsInput) {
  return useQuery({
    queryKey: platformKeys.fiscalJobs.list(filters),
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => listPlatformFiscalJobsFn({ data: filters, signal }),
  });
}

export function usePlatformFiscalJobDetail(jobId: string) {
  return useInfiniteQuery({
    queryKey: platformKeys.fiscalJobs.detail(jobId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => getPlatformFiscalJobFn({ data: { jobId, before: pageParam }, signal }),
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
    staleTime: 0,
  });
}

export function usePlatformFiscalJobActions(jobId: string) {
  return useQuery<FiscalAction[]>({
    queryKey: platformKeys.fiscalJobs.actions(jobId),
    retry: false,
    staleTime: 0,
    refetchInterval: (state) => (state.state.data?.some((action) => action.status === "pending") ? 5000 : false),
    queryFn: ({ signal }) => listPlatformFiscalActionsFn({ data: { jobId }, signal }),
  });
}
