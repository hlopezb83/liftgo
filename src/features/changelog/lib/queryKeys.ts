import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { fetchChangelogIndex, fetchChangelogDetail, fetchChangelogArchive } from "./changelog";
import type { ChangelogIndexEntry, ChangelogDetail } from "./changelog";

type ChangelogScope = Readonly<{ scope: "archive" }>;

export const changelogQueries = defineEntityQueries<
  "changelog",
  ChangelogIndexEntry[],
  ChangelogDetail,
  ChangelogScope
>("changelog", {
  // Sin filtro → índice ligero (últimas versiones). Con `scope: "archive"` →
  // histórico completo, que solo se pide cuando el usuario lo solicita.
  list: (filter) => (filter?.scope === "archive" ? fetchChangelogArchive : fetchChangelogIndex),
  detail: (version: string) => () => fetchChangelogDetail(version),
  staleTime: Infinity,
});
