import { useMemo, useState } from "react";
import type { Prospect } from "@/hooks/useProspects";

export type ValueRange = "all" | "lt100k" | "100k-500k" | "gt500k";
export type AgeRange = "all" | "week" | "month" | "stale";

export interface CRMFilters {
  creator: string;
  search: string;
  valueRange: ValueRange;
  ageRange: AgeRange;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function useCRMFilters(prospects: Prospect[]) {
  const [filters, setFilters] = useState<CRMFilters>({
    creator: "all",
    search: "",
    valueRange: "all",
    ageRange: "all",
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = filters.search.trim().toLowerCase();
    return prospects.filter((p) => {
      if (filters.creator !== "all" && p.created_by !== filters.creator) return false;

      if (q) {
        const hay = `${p.company_name} ${p.contact_person ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      const v = p.deal_value ?? 0;
      if (filters.valueRange === "lt100k" && v >= 100_000) return false;
      if (filters.valueRange === "100k-500k" && (v < 100_000 || v > 500_000)) return false;
      if (filters.valueRange === "gt500k" && v <= 500_000) return false;

      if (filters.ageRange !== "all") {
        const age = (now - new Date(p.updated_at).getTime()) / DAY_MS;
        if (filters.ageRange === "week" && age > 7) return false;
        if (filters.ageRange === "month" && age > 30) return false;
        if (filters.ageRange === "stale" && age <= 30) return false;
      }
      return true;
    });
  }, [prospects, filters]);

  const update = <K extends keyof CRMFilters>(key: K, value: CRMFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const reset = () =>
    setFilters({ creator: "all", search: "", valueRange: "all", ageRange: "all" });

  const hasActive =
    filters.creator !== "all" ||
    filters.search !== "" ||
    filters.valueRange !== "all" ||
    filters.ageRange !== "all";

  return { filters, update, reset, filtered, hasActive };
}

export function getStaleDays(updatedAt: string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / DAY_MS);
}
