import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { fetchChangelogIndex, fetchChangelogDetail, fetchChangelogArchive, getChangelogRelease } from "./changelog";
import type { ChangelogIndexEntry, ChangelogDetail } from "./changelog";

type ChangelogScope = Readonly<{ scope: "archive" }>;
type ChangelogFilter = Readonly<{ scope?: "archive"; release: string }>;

const entityQueries = defineEntityQueries<
  "changelog",
  ChangelogIndexEntry[],
  ChangelogDetail,
  ChangelogFilter
>("changelog", {
  // Sin filtro → índice ligero (últimas versiones). Con `scope: "archive"` →
  // histórico completo, que solo se pide cuando el usuario lo solicita.
  list: (filter) => (filter?.scope === "archive" ? fetchChangelogArchive : fetchChangelogIndex),
  detail: (version: string) => () => fetchChangelogDetail(version),
  staleTime: Infinity,
});

export const changelogQueries = {
  ...entityQueries,
  // Una caché persistida de otra publicación no debe sustituir ninguno de los índices.
  list: (filter?: ChangelogScope) => entityQueries.list({ ...filter, release: getChangelogRelease() }),
};
