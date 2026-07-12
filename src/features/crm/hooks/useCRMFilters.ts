import { useState } from "react";
import type { Prospect } from "./useProspects";

export type ValueRange = "all" | "lt100k" | "100k-500k" | "gt500k";
export type AgeRange = "all" | "week" | "month" | "stale";

export interface CRMFilters {
  creator: string;
  search: string;
  valueRange: ValueRange;
  ageRange: AgeRange;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FILTERS: CRMFilters = { creator: "all", search: "", valueRange: "all", ageRange: "all" };

function matchesValue(value: number, range: ValueRange): boolean {
  if (range === "all") return true;
  if (range === "lt100k") return value < 100_000;
  if (range === "100k-500k") return value >= 100_000 && value <= 500_000;
  return value > 500_000;
}

function matchesAge(updatedAt: string, range: AgeRange, now: number): boolean {
  if (range === "all") return true;
  const age = (now - new Date(updatedAt).getTime()) / DAY_MS;
  if (range === "week") return age <= 7;
  if (range === "month") return age <= 30;
  return age > 30;
}

function matchesSearch(p: Prospect, query: string): boolean {
  if (!query) return true;
  const hay = `${p.companyName} ${p.contactPerson ?? ""}`.toLowerCase();
  return hay.includes(query);
}

export function useCRMFilters(prospects: Prospect[]) {
  const [filters, setFilters] = useState<CRMFilters>(DEFAULT_FILTERS);

  const filtered = (() => {
    const now = Date.now();
    const q = filters.search.trim().toLowerCase();
    return prospects.filter((p) => {
      if (filters.creator !== "all" && p.createdBy !== filters.creator) return false;
      if (!matchesSearch(p, q)) return false;
      if (!matchesValue(p.dealValue ?? 0, filters.valueRange)) return false;
      if (!matchesAge(p.updatedAt, filters.ageRange, now)) return false;
      return true;
    });
  })();

  const update = <K extends keyof CRMFilters>(key: K, value: CRMFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const reset = () => setFilters(DEFAULT_FILTERS);

  const hasActive =
    filters.creator !== "all" ||
    filters.search !== "" ||
    filters.valueRange !== "all" ||
    filters.ageRange !== "all";

  return { filters, update, reset, filtered, hasActive };
}
