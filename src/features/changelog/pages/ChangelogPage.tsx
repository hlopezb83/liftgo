import { useState } from "react";
import { TablePagination } from "@/components/feedback/TablePagination";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { SearchBar } from "@/components/forms/SearchBar";
import { InfoAlertIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useListPage } from "@/hooks/useListPage";
import { ChangelogEntryCard } from "../components/changelog/ChangelogEntryCard";
import { useChangelog } from "../hooks/useChangelog";
import { useChangelogDeepLink } from "../hooks/useChangelogDeepLink";
import { getCurrentVersion } from "../lib/changelog";
import {
  TYPE_FILTERS, CATEGORY_FILTERS, type FilterType, type FilterCategory,
} from "../lib/changelogConstants";
import type { ChangelogIndexEntry } from "../lib/changelog";

const TYPE_OPTIONS = TYPE_FILTERS.filter((t) => t.value !== "all").map((t) => t.value) as string[];
const CATEGORY_OPTIONS = CATEGORY_FILTERS.filter((c) => c.value !== "all").map((c) => c.value) as string[];

export default function ChangelogPage() {
  const { data: changelog = [], isLoading, error } = useChangelog();
  const { expanded, highlighted, toggle } = useChangelogDeepLink(changelog);

  const { values, set, reset, hasActive, filtered, filterKey } = useTableFilters<
    ChangelogIndexEntry,
    {
      q: { type: "text"; fields: (keyof ChangelogIndexEntry)[] };
      type: { type: "enum"; field: "type"; options: string[] };
      category: { type: "enum"; field: "category"; options: string[] };
    }
  >({
    items: changelog,
    facets: {
      q: { type: "text", fields: ["version", "title"] },
      type: { type: "enum", field: "type", options: TYPE_OPTIONS },
      category: { type: "enum", field: "category", options: CATEGORY_OPTIONS },
    },
  });

  const filter = (values.type || "all") as FilterType;
  const categoryFilter = (values.category || "all") as FilterCategory;

  const { page, setPage, totalPages, paginatedItems } = useListPage(filtered);

  // Reset a página 1 cuando cambian los filtros — patrón "adjust state during render".
  const [prevFiltersKey, setPrevFiltersKey] = useState(filterKey);
  if (prevFiltersKey !== filterKey) {
    setPrevFiltersKey(filterKey);
    if (page !== 1) setPage(1);
  }


  if (isLoading) {
    return (
      <PageContainer maxWidth="form">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="form">
        <Card>
          <CardContent className="text-center space-y-2">
            <InfoAlertIcon className="h-8 w-8 text-destructive mx-auto" />
            <p className="font-semibold">No se pudo cargar el historial de cambios</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="form">
      <PageHeader
        title="Historial de Cambios"
        subtitle={`Versión actual: v${getCurrentVersion(changelog)} · ${changelog.length} entradas`}
      />

      <FiltersToolbar>
        <SearchBar
          value={values.q}
          onChange={(v) => set("q", v)}
          placeholder="Buscar por versión o título…"
          className="w-full sm:max-w-sm"
        />
        <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
      </FiltersToolbar>

      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por tipo">
          {TYPE_FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => set("type", f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por categoría">
          {CATEGORY_FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={categoryFilter === f.value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => set("category", f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>


      {filtered.length === 0 ? (
        <Card><CardContent className="text-center text-muted-foreground">Sin resultados</CardContent></Card>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" aria-hidden />
          <ol className="space-y-6 list-none">
            {paginatedItems.map((entry) => (
              <ChangelogEntryCard
                key={entry.version}
                entry={entry}
                expanded={expanded.has(entry.version)}
                onToggle={() => toggle(entry.version)}
                highlighted={highlighted === entry.version}
              />
            ))}
          </ol>
        </div>
      )}

      <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </PageContainer>
  );
}
