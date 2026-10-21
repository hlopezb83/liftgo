import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { useHasModuleAccess } from "@/features/users";
import { toYMD } from "@/lib/date/toYMD";
import { forkliftKeys } from "../../lib/queryKeys";
import { fetchAvailabilityReasons } from "./fetchAvailabilityReasons";
import type { DateRange } from "react-day-picker";

export function useAvailabilityReasons(dateRange: DateRange | undefined, open: boolean) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const organization = useOrganizationContext();
  const canReadFleet = useHasModuleAccess("Flota", "read");
  const canReadBookings = useHasModuleAccess("Reservas", "read");
  const organizationId = organization.status === "ready" && organization.memberType === "internal"
    ? organization.organizationId : undefined;
  const start = toYMD(dateRange?.from);
  const end = toYMD(dateRange?.to);
  const allowed = !!user?.id && !!organizationId && canReadFleet;
  const enabled = open && allowed && !!start && !!end && start <= end;
  const query = useQuery({
    // Under lists(): existing booking, fleet, return and maintenance invalidations
    // refresh this evidence too. Identity and permissions are explicit key parts.
    queryKey: forkliftKeys.list({ purpose: "availability-reasons", userId: user?.id, organizationId, start, end, canReadBookings }),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: ({ signal }) => {
      if (!allowed || !organizationId || !start || !end) throw new Error("Consulta de disponibilidad no autorizada");
      return fetchAvailabilityReasons({ organizationId, start, end, canReadBookings, signal });
    },
  });
  // Refresh both this explanation and the existing selectable-fleet query.
  // Otherwise a newly released unit could be explained correctly but remain
  // absent from a selector still serving its 30-second cache.
  const refresh = () => queryClient.invalidateQueries({ queryKey: forkliftKeys.lists() });
  return { ...query, data: enabled ? query.data : undefined, allowed, refresh };
}
