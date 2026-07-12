import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { fetchChangelogIndex, fetchChangelogDetail } from "./changelog";

export const changelogQueries = defineEntityQueries("changelog", {
  list: () => fetchChangelogIndex,
  detail: (version: string) => () => fetchChangelogDetail(version),
  staleTime: Infinity,
});
