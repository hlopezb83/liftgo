import { useState, useEffect, useMemo, useRef } from "react";
import { Link as LinkIcon, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/SearchBar";
import { useChangelog, useChangelogEntry } from "@/hooks/useChangelog";
import { getCurrentVersion, type ChangelogIndexEntry, type ChangelogType, type ChangelogCategory } from "@/lib/changelog";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";

type FilterType = "all" | ChangelogType;
type FilterCategory = "all" | ChangelogCategory;

const TYPE_LABELS: Record<ChangelogType, string> = { major: "Mayor", minor: "Menor", patch: "Parche" };
const TYPE_COLORS: Record<ChangelogType, string> = {
  major: "bg-destructive text-destructive-foreground",
  minor: "bg-primary text-primary-foreground",
  patch: "bg-muted text-muted-foreground",
};
const DOT_COLORS: Record<ChangelogType, string> = {
  major: "bg-destructive",
  minor: "bg-primary",
  patch: "bg-muted-foreground",
};
const CATEGORY_LABELS: Record<ChangelogCategory, string> = {
  feature: "Funcionalidad",
  fix: "Corrección",
  docs: "Documentación",
  refactor: "Refactor",
  security: "Seguridad",
};

function ChangelogEntryCard({
  entry,
  expanded,
  onToggle,
  highlighted,
}: {
  entry: ChangelogIndexEntry;
  expanded: boolean;
  onToggle: () => void;
  highlighted: boolean;
}) {
  const { data: detail, isLoading: detailLoading, error: detailError } = useChangelogEntry(entry.version, expanded);

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/changelog#v${entry.version}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Enlace copiado"),
      () => toast.error("No se pudo copiar el enlace"),
    );
  };

  return (
    <li id={`v${entry.version}`} className="relative pl-10 scroll-mt-20">
      <div
        className={`absolute left-2.5 top-6 h-3 w-3 rounded-full ring-2 ring-background ${DOT_COLORS[entry.type]}`}
        aria-hidden
      />
      <Card className={highlighted ? "ring-2 ring-primary transition-shadow" : "transition-shadow"}>
        <CardContent className="p-5 space-y-3">
          <button
            type="button"
            onClick={onToggle}
            className="w-full flex items-start gap-2 text-left"
            aria-expanded={expanded}
            aria-controls={`detail-${entry.version}`}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={TYPE_COLORS[entry.type]}>v{entry.version}</Badge>
                <Badge variant="outline">{TYPE_LABELS[entry.type]}</Badge>
                {entry.category && <Badge variant="secondary">{CATEGORY_LABELS[entry.category]}</Badge>}
                <span className="text-xs text-muted-foreground">
                  {format(parseISO(entry.date), "d 'de' MMMM, yyyy", { locale: es })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyLink}
                  className="h-6 px-2 ml-auto text-muted-foreground hover:text-foreground"
                  aria-label={`Copiar enlace a v${entry.version}`}
                >
                  <LinkIcon className="h-3 w-3" />
                </Button>
              </div>
              <h3 className="font-semibold text-base">{entry.title}</h3>
            </div>
          </button>

          {expanded && (
            <div id={`detail-${entry.version}`} className="pl-6 space-y-2">
              {detailLoading && (
                <>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </>
              )}
              {detailError && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> No se pudo cargar el detalle
                </p>
              )}
              {detail && (
                <>
                  <p className="text-sm text-muted-foreground">{detail.description}</p>
                  <ul className="space-y-1">
                    {detail.changes.map((change, i) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-muted-foreground mt-1">•</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

export default function ChangelogPage() {
  const { data: changelog = [], isLoading, error } = useChangelog();
  const [filter, setFilter] = useState<FilterType>("all");
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const initialHashHandled = useRef(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return changelog.filter((e) => {
      if (filter !== "all" && e.type !== filter) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (q && !`${e.version} ${e.title}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [changelog, filter, categoryFilter, search]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);
  useEffect(() => { setPage(1); }, [filter, categoryFilter, search, setPage]);

  // Deep-linking: /changelog#v5.43.2
  useEffect(() => {
    if (initialHashHandled.current || changelog.length === 0) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("v")) return;
    const version = hash.slice(1);
    if (!changelog.some((e) => e.version === version)) return;
    initialHashHandled.current = true;
    setExpanded((prev) => new Set(prev).add(version));
    setHighlighted(version);
    setTimeout(() => {
      document.getElementById(`v${version}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    setTimeout(() => setHighlighted(null), 2500);
  }, [changelog]);

  const toggle = (version: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  const filters: { value: FilterType; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "major", label: "Mayor" },
    { value: "minor", label: "Menor" },
    { value: "patch", label: "Parche" },
  ];
  const categoryFilters: { value: FilterCategory; label: string }[] = [
    { value: "all", label: "Todas" },
    { value: "feature", label: "Funcionalidad" },
    { value: "fix", label: "Corrección" },
    { value: "docs", label: "Documentación" },
    { value: "refactor", label: "Refactor" },
    { value: "security", label: "Seguridad" },
  ];

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="font-semibold">No se pudo cargar el historial de cambios</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Historial de Cambios"
        subtitle={`Versión actual: v${getCurrentVersion(changelog)} · ${changelog.length} entradas`}
      />

      <SearchBar value={search} onChange={setSearch} placeholder="Buscar por versión o título…" className="max-w-full" />

      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por tipo">
          {filters.map((f) => (
            <Button key={f.value} variant={filter === f.value ? "default" : "outline"} size="sm" onClick={() => setFilter(f.value)}>
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por categoría">
          {categoryFilters.map((f) => (
            <Button key={f.value} variant={categoryFilter === f.value ? "secondary" : "ghost"} size="sm" onClick={() => setCategoryFilter(f.value)}>
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Sin resultados</CardContent></Card>
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
    </div>
  );
}
