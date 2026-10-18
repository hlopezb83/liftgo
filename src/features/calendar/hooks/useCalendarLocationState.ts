import { isValid, parseISO } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readSessionParams, writeSessionParams } from "@/hooks/filters/sessionStorage";
import { toYMD } from "@/lib/date/toYMD";
import { useLocation, useSearchParams } from "@/lib/router-compat";
import { nowMty } from "@/lib/utils";

type ViewMode = "gantt" | "list";
type CalendarRange = "month" | "week";
const CALENDAR_PATH = "/calendar";

function readDate(value: string | null, fallback: Date): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = parseISO(value);
  return isValid(parsed) && toYMD(parsed) === value ? parsed : fallback;
}

/** The URL owns the visible period. Session state only supplies a bare reentry. */
export function useCalendarLocationState(isMobile: boolean) {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const [fallbackDate] = useState(nowMty);
  const [savedParams] = useState(() => readSessionParams(CALENDAR_PATH));
  const state = useMemo(() => {
    const source = ["date", "view", "range"].some((key) => params.has(key)) ? params : savedParams;
    return {
      currentDate: readDate(source.get("date"), fallbackDate),
      viewMode: source.get("view") === "gantt" || source.get("view") === "list"
        ? source.get("view") as ViewMode : isMobile ? "list" : "gantt",
      ganttRange: source.get("range") === "week" ? "week" as const : "month" as const,
    };
  }, [params, savedParams, fallbackDate, isMobile]);

  const date = toYMD(state.currentDate);
  const { viewMode, ganttRange } = state;
  useEffect(() => {
    if (pathname !== CALENDAR_PATH) return;
    const saved = new URLSearchParams({ date, view: viewMode, range: ganttRange });
    writeSessionParams(CALENDAR_PATH, saved);
    if (params.get("date") === date && params.get("view") === viewMode && params.get("range") === ganttRange) return;
    setParams((current) => {
      const next = new URLSearchParams(current);
      saved.forEach((value, key) => next.set(key, value));
      return next;
    }, { replace: true, expectedPathname: CALENDAR_PATH });
  }, [date, viewMode, ganttRange, params, setParams, pathname]);

  const update = useCallback((patch: { date?: string; view?: ViewMode; range?: CalendarRange }) => {
    if (pathname !== CALENDAR_PATH) return;
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("date", patch.date ?? date);
      next.set("view", patch.view ?? viewMode);
      next.set("range", patch.range ?? ganttRange);
      return next;
    }, { replace: true, expectedPathname: CALENDAR_PATH });
  }, [setParams, date, viewMode, ganttRange, pathname]);

  return {
    ...state,
    setCurrentDate: (next: Date) => update({ date: toYMD(next) }),
    setViewMode: (next: ViewMode) => update({ view: next }),
    setGanttRange: (next: CalendarRange) => update({ range: next }),
  };
}
