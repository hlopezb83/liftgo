import { queryOptions, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo } from "react";
import { applyFacetFilters } from "@/hooks/filters/applyFacetFilters";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_STATUSES } from "@/lib/constants";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { useLocation } from "@/lib/router-compat";
import { e2eVisibilityFilter, LIST_FETCH_LIMIT, visibleListRows } from "@/lib/supabase/constants";
import { bookingKeys } from "../../lib/queryKeys";
import { bookingQueries, type useBookings } from "./useBookings";

type Booking = NonNullable<ReturnType<typeof useBookings>["data"]>[number];
const FACETS = {
  q: { type: "text" as const, fields: ["customer_name", "booking_number"] as (keyof Booking)[] },
  status: { type: "enum" as const, field: "status" as const, options: ["all", ...BOOKING_STATUSES] },
  view: { type: "enum" as const, options: ["all", "upcoming"] },
};

/** Filters and ordering run on the server before the 500 + 1 safety limit. */
export function upcomingBookingsQuery(filters: { q: string; status: string }, today = todayKeyMty()) {
  const visibility = e2eVisibilityFilter();
  return queryOptions<Booking[]>({
    queryKey: bookingKeys.list({ view: "upcoming", ...filters, today, visibility }),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      let query = supabase.from("bookings").select("*, forklifts(name, model)").or(visibility)
        .in("status", ["confirmed"]).gte("start_date", today);
      if (filters.status !== "all") query = query.eq("status", filters.status);
      const search = filters.q.replace(/[%_,()]/g, " ").trim();
      if (search) query = query.or(`customer_name.ilike.%${search}%,booking_number.ilike.%${search}%`);
      const { data, error } = await query.abortSignal(signal)
        .order("start_date", { ascending: true }).order("id", { ascending: true }).limit(LIST_FETCH_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBookingListView() {
  const filters = useTableFilters<Booking, typeof FACETS>({ mode: "server", facets: FACETS });
  const { q, status: requestedStatus, view } = filters.values;
  const deferredSearch = useDeferredValue(q);
  const upcoming = view === "upcoming";
  const incompatibleStatus = upcoming && requestedStatus !== "all" && requestedStatus !== "confirmed";
  const status = incompatibleStatus ? "all" : requestedStatus;
  const { set } = filters;
  // Also repair older bookmarks before they can request contradictory statuses.
  useEffect(() => {
    if (incompatibleStatus) set("status", "all");
  }, [incompatibleStatus, set]);
  // Only one query is active; Todos retains its legacy cache and read behavior.
  const query = useQuery(upcoming ? upcomingBookingsQuery({ q, status }) : bookingQueries.list());
  const filtered = useMemo(() => {
    const rows = visibleListRows(query.data);
    return upcoming ? rows : applyFacetFilters(rows, { q: FACETS.q, status: FACETS.status }, { q: deferredSearch, status });
  }, [query.data, upcoming, deferredSearch, status]);
  const location = useLocation();
  const navigate = useNavigateTransition();
  const setView = (value: string) => {
    const next = new URLSearchParams(location.search);
    if (value === "upcoming") {
      next.set("view", value);
      if (requestedStatus !== "all" && requestedStatus !== "confirmed") next.delete("status");
    }
    else next.delete("view");
    next.delete("tablePage");
    next.delete("tableSort");
    navigate({ pathname: location.pathname, search: next.toString() ? `?${next}` : "" }, { replace: true });
  };
  return { ...filters, values: { ...filters.values, status }, filtered, query, upcoming, setView };
}
