import { queryOptions, useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_STATUSES } from "@/lib/constants";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { e2eVisibilityFilter } from "@/lib/supabase/constants";
import { bookingKeys } from "../../lib/queryKeys";
import type { useBookings } from "./useBookings";
import type { PaginationState, SortingState } from "@tanstack/react-table";

export type BookingPageRow = NonNullable<ReturnType<typeof useBookings>["data"]>[number];
export interface BookingPageFilters extends PaginationState {
  q: string;
  status: string;
  upcoming: boolean;
  sorting: SortingState;
}
const sortColumns: Record<string, string> = {
  booking_number: "booking_number", forklift_name: "forklifts(name)", customer_name: "customer_name",
  start_date: "start_date", end_date: "end_date", status: "status",
};

export function bookingPageQueryOptions(organizationId: string | undefined, input: BookingPageFilters, today = todayKeyMty()) {
  const seen = new Set<string>();
  const filters = {
    ...input,
    q: input.q.replace(/[\\%_",().]/g, " ").trim(),
    status: BOOKING_STATUSES.some(status => status === input.status) ? input.status : "all",
    pageIndex: Number.isSafeInteger(input.pageIndex) ? Math.max(0, Math.min(100000, input.pageIndex)) : 0,
    pageSize: Number.isSafeInteger(input.pageSize) ? Math.max(1, Math.min(100, input.pageSize)) : 25,
    sorting: input.sorting.filter(({ id }) => {
      if (!Object.hasOwn(sortColumns, id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, 5),
  };
  if (filters.upcoming && filters.status !== "confirmed") filters.status = "all";
  const visibility = e2eVisibilityFilter();
  return queryOptions({
    queryKey: bookingKeys.list({ scope: "page", organizationId, ...filters, today: filters.upcoming ? today : undefined, visibility }),
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!organizationId) throw new Error("No se pudo verificar la empresa.");
      const filteredQuery = (head = false) => {
        let query = supabase.from("bookings").select("*, forklifts(name, model)", { count: "exact", head })
          .eq("organization_id", organizationId).or(visibility);
        if (filters.upcoming) query = query.eq("status", "confirmed").gte("start_date", today);
        else if (filters.status !== "all") query = query.eq("status", filters.status);
        if (filters.q) query = query.or(`customer_name.ilike.%${filters.q}%,booking_number.ilike.%${filters.q}%`);
        return query.abortSignal(signal);
      };
      const fetchPage = (pageIndex: number) => {
        let query = filteredQuery();
        const sorting = filters.sorting.length ? filters.sorting : [{ id: "start_date", desc: !filters.upcoming }];
        for (const sort of sorting) query = query.order(sortColumns[sort.id], { ascending: !sort.desc, nullsFirst: false });
        return query.order("id", { ascending: true }).range(pageIndex * filters.pageSize, (pageIndex + 1) * filters.pageSize - 1);
      };
      let pageIndex = filters.pageIndex;
      let response = await fetchPage(pageIndex);
      if (response.error?.code === "PGRST103") {
        // A deleted last page can return 416; recover only after a successful count.
        const countResponse = await filteredQuery(true);
        if (countResponse.error) throw countResponse.error;
        if (countResponse.count === null) throw new Error("No se pudo contar las reservas.");
        pageIndex = Math.min(pageIndex, Math.max(0, Math.ceil(countResponse.count / filters.pageSize) - 1));
        response = await fetchPage(pageIndex);
      }
      if (response.error) throw response.error;
      if (response.count === null) throw new Error("No se pudo contar las reservas.");
      const lastPage = Math.max(0, Math.ceil(response.count / filters.pageSize) - 1);
      if (pageIndex > lastPage) {
        pageIndex = lastPage;
        response = await fetchPage(pageIndex);
        if (response.error) throw response.error;
        if (response.count === null) throw new Error("No se pudo contar las reservas.");
      }
      return { items: response.data ?? [], totalCount: response.count, pageIndex };
    },
  });
}

/** Only the main list uses pages; calendars and equipment details keep their contracts. */
export function useBookingPage(filters: BookingPageFilters) {
  const organization = useOrganizationContext();
  const query = useQuery(bookingPageQueryOptions(organization.status === "ready" ? organization.organizationId : undefined, filters));
  return { ...query,
    isLoading: organization.status === "loading" || query.isLoading,
    isError: (organization.status !== "ready" && organization.status !== "loading") || query.isError,
  };
}
