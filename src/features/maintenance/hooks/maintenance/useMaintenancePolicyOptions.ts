import { useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { computeFleetAvailability } from "@/features/availability";
import { bookingKeys } from "@/features/bookings";
import { forkliftKeys } from "@/features/fleet";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { e2eVisibilityFilter } from "@/lib/supabase/constants";
import { maintenancePolicyKeys } from "../../lib/queryKeys";
import { fetchPolicyBookings, fetchPolicyForklifts, fetchPolicyReferences, PolicyOptionsReadLimitError, type PolicyBooking, type PolicyForklift, type PolicyReference } from "./fetchMaintenancePolicyOptions";

function selectableForklifts(
  fleet: PolicyForklift[] | undefined,
  bookings: PolicyBooking[] | undefined,
  policies: PolicyReference[] | undefined,
  today: string,
  editId: string | null,
) {
  const editedForkliftId = policies?.find((policy) => policy.id === editId)?.forklift_id;
  const reservedIds = new Set(policies?.map((policy) => policy.forklift_id));
  const rentedIds = computeFleetAvailability(fleet, bookings, today)?.rentedForkliftIds;
  return fleet?.filter((forklift) =>
    forklift.id === editedForkliftId || (rentedIds?.has(forklift.id) && !reservedIds.has(forklift.id)),
  ).sort((a, b) => a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id));
}

/** Dedicated, complete inputs. Keep each source under its entity's list key
 * so existing booking/fleet/policy mutations invalidate the selector too. */
export function useMaintenancePolicyOptions(today: string, editId: string | null, open: boolean) {
  const organization = useOrganizationContext();
  const identity = useVerifiedIdentityScope();
  const organizationId = organization.status === "ready" && organization.memberType === "internal"
    ? organization.organizationId : undefined;
  const enabled = open && !!identity && !!organizationId;
  const visibility = e2eVisibilityFilter();
  const common = { enabled, staleTime: 0, refetchOnMount: "always" as const, retry: false };
  const scope = { purpose: "maintenance-policy-options", identity, organizationId };
  const fleet = useQuery({
    ...common,
    queryKey: forkliftKeys.list(scope),
    queryFn: ({ signal }) => {
      if (!organizationId || !identity) throw new Error("No se pudo verificar la empresa.");
      return fetchPolicyForklifts(organizationId, signal);
    },
  });
  const bookings = useQuery({
    ...common,
    queryKey: bookingKeys.byFilter({ ...scope, today, visibility }),
    queryFn: ({ signal }) => {
      if (!organizationId || !identity) throw new Error("No se pudo verificar la empresa.");
      return fetchPolicyBookings(organizationId, today, visibility, signal);
    },
  });
  const policies = useQuery({
    ...common,
    queryKey: maintenancePolicyKeys.byFilter(scope),
    queryFn: ({ signal }) => {
      if (!organizationId || !identity) throw new Error("No se pudo verificar la empresa.");
      return fetchPolicyReferences(organizationId, signal);
    },
  });
  const queries = [fleet, bookings, policies];
  const isError = (open && organization.status !== "loading" && (!organizationId || !identity))
    || queries.some((query) => query.isError);
  // Cached partial data or a failed/background refresh must never enable saving.
  const isReady = enabled && queries.every((query) => query.isSuccess && !query.isFetching);
  const isLoading = open && !isError && !isReady;
  const data = isReady ? selectableForklifts(fleet.data, bookings.data, policies.data, today, editId) : undefined;

  const limitError = queries.map((query) => query.error).find((error) => error instanceof PolicyOptionsReadLimitError);

  return {
    data,
    limitMessage: limitError?.message,
    isReady,
    isLoading,
    isError,
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
