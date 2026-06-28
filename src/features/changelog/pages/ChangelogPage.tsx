import { useState, useEffect, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/forms/SearchBar";
import { useChangelog } from "../hooks/useChangelog";
import { getCurrentVersion } from "../lib/changelog";
import { useListPage } from "@/hooks/useListPage";
import { TablePagination } from "@/components/feedback/TablePagination";
import { ChangelogEntryCard } from "../components/changelog/ChangelogEntryCard";
import { useChangelogDeepLink } from "../hooks/useChangelogDeepLink";
import {
  TYPE_FILTERS, CATEGORY_FILTERS, type FilterType, type FilterCategory,
} from "../lib/changelogConstants";

export default function ChangelogPage() {
  const { data: changelog = [], isLoading, error } = useChangelog();
  const [filter, setFilter] = useState<FilterType>("all");
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("all");
  const [search, setSearch] = useState("");
  const { expanded, highlighted, toggle } = useChangelogDeepLink(changelog);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return changelog.filter((e) => {
      if (filter !== "all" && e.type !== filter) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (q && !`${e.version} ${e.title}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [changelog, filter, categoryFilter, search]);

  const { page, setPage, totalPages, paginatedItems } = useListPage(filtered);
  useEffect(() => { setPage(1); }, [filter, categoryFilter, search, setPage]);

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
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
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

      <SearchBar value={search} onChange={setSearch} placeholder="Buscar por versión o título…" className="max-w-full" />

      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por tipo">
          {TYPE_FILTERS.map((f) => (
            <Button key={f.value} variant={filter === f.value ? "default" : "outline"} size="sm" onClick={() => setFilter(f.value)}>
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por categoría">
          {CATEGORY_FILTERS.map((f) => (
            <Button key={f.value} variant={categoryFilter === f.value ? "secondary" : "ghost"} size="sm" onClick={() => setCategoryFilter(f.value)}>
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
