import { useCallback, useEffect, useState, useMemo, useRef, useTransition } from "react";
import { routeLoaders } from "@/app-routes/routes-config";
import { UsersIcon, DocumentIcon, BookOpen, DeliveryIcon, InvoiceIcon, SearchIcon, SpinnerIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useEntitySearch, type EntityResults } from "@/features/system/hooks/useEntitySearch";
import { getNavigationAccessLevel, useHasFinancialAccess, useHasModuleAccess, useRolePermissions, useUserRole } from "@/features/users";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { SEARCH_NAVIGATION_ITEMS, type SearchNavigationItem } from "@/lib/navigation/navigationCatalog";
import { notifyError } from "@/lib/ui/appFeedback";
import { restoreModalFocus } from "@/lib/ui/restoreModalFocus";
import { normalizeQuoteNumber } from "../lib/quoteSearchTerm";

const SECTION_LABELS: Record<string, string> = {
  quotes: "Cotizaciones", invoices: "Facturas", customers: "Clientes", bookings: "Reservas", deliveries: "Entregas", returns: "Devoluciones",
};

/**
 * L-6a: fallo parcial de una sección — avisar en vez de mostrarla vacía como
 * si simplemente no hubiera coincidencias.
 */
function SearchPartialErrors({ errors, isFetching, onRetry }: { errors?: Record<string, string>; isFetching: boolean; onRetry: () => void }) {
  const failed = Object.keys(errors ?? {}).map((k) => SECTION_LABELS[k] ?? k);
  if (failed.length === 0) return null;
  return (
    <div className="px-3 py-2 text-xs text-warning" role="status">
      No se pudo buscar en: {failed.join(", ")}. Intenta de nuevo.
      <Button variant="ghost" size="sm" onClick={onRetry} disabled={isFetching}>Reintentar búsqueda</Button>
    </div>
  );
}

type EntityHit = { id: string; label: string; sub?: string; url: string };
type EntityGroup = { heading: string; prefix: string; hits: EntityHit[]; mono: boolean };

/** Grupos de entidades encontradas; cada sección conserva su límite. */
function EntitySearchResults({
  entities, query, isPending, onSelect,
}: {
  entities: EntityResults;
  query: string;
  isPending: boolean;
  onSelect: (url: string) => void;
}) {
  const normalizedQuote = normalizeQuoteNumber(query);
  const sections: EntityGroup[] = [
    { heading: "Cotizaciones", prefix: "cot", hits: entities.quotes, mono: true },
    { heading: "Facturas", prefix: "fac", hits: entities.invoices, mono: true },
    { heading: "Clientes", prefix: "cli", hits: entities.customers, mono: false },
    { heading: "Reservas", prefix: "rsv", hits: entities.bookings, mono: true },
    { heading: "Entregas", prefix: "ent", hits: entities.deliveries, mono: true },
    { heading: "Devoluciones", prefix: "dev", hits: entities.returns, mono: true },
  ];
  return (
    <>
      {sections.filter((s) => s.hits.length > 0).map((s) => (
        <CommandGroup key={s.prefix} heading={s.heading}>
          {s.hits.map((e) => (
            <CommandItem key={e.id} value={s.prefix === "cot" && e.label === normalizedQuote ? query.trim() : `${s.prefix} ${e.label} ${e.sub ?? ""}`} onSelect={() => onSelect(e.url)} disabled={isPending}>
              {s.prefix === "cot" ? <DocumentIcon className="mr-2 h-4 w-4" />
                : s.prefix === "fac" ? <InvoiceIcon className="mr-2 h-4 w-4" />
                : s.prefix === "cli" ? <UsersIcon className="mr-2 h-4 w-4" />
                : s.prefix === "rsv" ? <BookOpen className="mr-2 h-4 w-4" />
                : <DeliveryIcon className="mr-2 h-4 w-4" />}
              <span className={s.mono ? "font-mono text-xs" : undefined}>{e.label}</span>
              {e.sub ? <span className={`ml-2 text-muted-foreground text-xs truncate${s.prefix === "cli" ? " font-mono" : ""}`}>{e.sub}</span> : null}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  );
}

function authorizedResults(data: EntityResults | undefined, canVisit: (url: string) => boolean, canSeeFinancials: boolean, canSearchQuotes: boolean): EntityResults | undefined {
  const sectionRoutes: Record<string, string> = {
    quotes: "/quotes", invoices: "/invoices", customers: "/customers", bookings: "/bookings", deliveries: "/deliveries", returns: "/returns",
  };
  return data ? {
    ...data,
    quotes: canSearchQuotes ? data.quotes.filter((hit) => canVisit(hit.url)) : [],
    invoices: canSeeFinancials ? data.invoices.filter((hit) => canVisit(hit.url)) : [],
    customers: data.customers.filter((hit) => canVisit(hit.url)),
    bookings: data.bookings.filter((hit) => canVisit(hit.url)),
    deliveries: data.deliveries.filter((hit) => canVisit(hit.url)),
    returns: data.returns.filter((hit) => canVisit(hit.url)),
    errors: Object.fromEntries(Object.entries(data.errors ?? {}).filter(([section]) =>
      !!sectionRoutes[section] && canVisit(sectionRoutes[section]) && (section !== "invoices" || canSeeFinancials) && (section !== "quotes" || canSearchQuotes),
    )),
  } : undefined;
}

function SearchFeedback({ isLoading, isError, errors, onRetry }: {
  isLoading: boolean; isError: boolean; errors?: EntityResults["errors"]; onRetry: () => void;
}) {
  const hasPartialErrors = Object.keys(errors ?? {}).length > 0;
  return <>
    {!isLoading && !isError && !hasPartialErrors && <CommandEmpty>
      <div className="flex flex-col items-center gap-1 py-4 text-xs text-muted-foreground">
        <span>Sin resultados.</span>
        <span className="opacity-70">Prueba con otro término o revisa la ortografía.</span>
      </div>
    </CommandEmpty>}
    {isError && <div className="px-3 py-2 text-xs text-destructive" role="alert">
      No se pudo completar la búsqueda. Intenta de nuevo.
      <Button variant="ghost" size="sm" onClick={onRetry} disabled={isLoading}>Reintentar búsqueda</Button>
    </div>}
    <SearchPartialErrors errors={errors} isFetching={isLoading} onRetry={onRetry} />
  </>;
}

function AccessAwareSearchFeedback({ query, isLoading, errors }: {
  query: ReturnType<typeof useEntitySearch>; isLoading: boolean; errors?: EntityResults["errors"];
}) {
  if (query.isAccessError) return <div className="px-3 py-2 text-xs text-destructive" role="alert">
    No se pudo verificar tu acceso. Intenta de nuevo.
    <Button variant="ghost" size="sm" onClick={() => void query.retryAccess()} disabled={query.isResolvingAccess}>Reintentar acceso</Button>
  </div>;
  return <SearchFeedback isLoading={isLoading} isError={query.canSearchEntities && query.isError}
    errors={errors} onRetry={() => void query.refetch()} />;
}

function searchIsLoading(input: string, debouncedInput: string, query: ReturnType<typeof useEntitySearch>): boolean {
  return query.isResolvingAccess || (query.canSearchEntities &&
    (query.isFetching || (input.trim().length >= 2 && (input !== debouncedInput || query.isPending))));
}

export function GlobalSearch() {
  const canSeeFinancials = useHasFinancialAccess();
  const canSearchQuotes = useHasModuleAccess("Cotizaciones", "read");
  const { data: role, isError: roleError } = useUserRole();
  const { data: permissionData, isError: permissionsError } = useRolePermissions();
  const perms = roleError || permissionsError ? undefined : permissionData;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigatingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const debouncedInput = useDebouncedValue(input, 200);
  const navigate = useNavigateTransition();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        const isInput = tag === "input" || tag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable;
        if (isInput) return;
        e.preventDefault();
        navigatingRef.current = false;
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setInput("");
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, SearchNavigationItem[]>();
    SEARCH_NAVIGATION_ITEMS.filter((item) => getNavigationAccessLevel(perms, role ?? undefined, item.url) !== "none").forEach((i) => {
      const arr = map.get(i.group) ?? [];
      arr.push(i);
      map.set(i.group, arr);
    });
    return [...map.entries()];
  }, [perms, role]);

  const entityQuery = useEntitySearch(input, open, debouncedInput);
  // A role/permission switch must not retain links from a privileged query.
  const canVisit = (url: string) => getNavigationAccessLevel(perms, role ?? undefined, url) !== "none";
  const isSearchLoading = searchIsLoading(input, entityQuery.activeQuery, entityQuery);
  const entities = authorizedResults(input === entityQuery.activeQuery ? entityQuery.data : undefined, canVisit, canSeeFinancials, canSearchQuotes);
  const hasEntities = !!entities && (entities.quotes.length + entities.invoices.length + entities.customers.length + entities.bookings.length + entities.deliveries.length + entities.returns.length > 0);

  const go = (url: string) => {
    if (url.startsWith("/quotes/") && (!canSearchQuotes || !canVisit(url))) return;
    navigatingRef.current = true;
    setOpen(false);
    startTransition(() => {
      try {
        navigate(url);
      } catch (err) {
        navigatingRef.current = false;
        console.error("GlobalSearch navigation failed", err);
        notifyError({ error: err, title: "No se pudo abrir la sección. Intenta de nuevo.", severity: "warning" });
      }
    });
  };

  return (
    <>
      {/* Bug 7: "Buscar…" prometía búsqueda de contenido; el cajón navega a
          módulos y entidades (facturas/clientes/reservas) → "Ir a…". */}
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        onClick={() => { navigatingRef.current = false; setOpen(true); }}
        className="h-8 gap-2 text-muted-foreground hover:text-foreground px-2.5 touch:h-11 touch:min-w-11"
        aria-label="Navegación rápida"
      >
        <SearchIcon className="h-3.5 w-3.5" />
        <span className="hidden md:inline text-xs">Ir a…</span>
        <Badge variant="secondary" className="hidden md:inline-flex text-3xs px-1.5 py-0 font-mono opacity-70">
          Ctrl+K
        </Badge>
      </Button>

      <CommandDialog open={open} onOpenChange={handleOpenChange} title="Navegación rápida" description="Busca módulos y registros de la aplicación." onCloseAutoFocus={(event) => {
        if (navigatingRef.current) { event.preventDefault(); return; }
        restoreModalFocus(event, triggerRef.current);
      }}>
        {/* cmdk keeps module filtering. Exact quote values match the current
            input so normalized folios stay visible and rank before broad hits. */}
        <CommandInput
          placeholder={`Buscar módulo, ${canSearchQuotes ? "cotización, " : ""}${canSeeFinancials ? "factura, " : ""}cliente o reserva…`}
          value={input}
          onValueChange={setInput}
        />
        <CommandList>
          <AccessAwareSearchFeedback query={entityQuery} isLoading={!!isSearchLoading} errors={entities?.errors} />

          {hasEntities && (
            <EntitySearchResults entities={entities} query={input} isPending={isPending} onSelect={go} />
          )}

          {groups.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => (
                <CommandItem
                  key={item.url}
                  value={`${item.title} ${item.keywords ?? ""}`}
                  onSelect={() => go(item.url)}
                  onMouseEnter={() => routeLoaders[item.url]?.()}
                  disabled={isPending}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <div className="flex items-center justify-between border-t px-3 py-2 text-3xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><kbd className="rounded border bg-muted px-1 font-mono">↑</kbd> <kbd className="rounded border bg-muted px-1 font-mono">↓</kbd> navegar</span>
            <span><kbd className="rounded border bg-muted px-1 font-mono">Enter</kbd> abrir</span>
            <span><kbd className="rounded border bg-muted px-1 font-mono">Esc</kbd> cerrar</span>
          </div>
          {isPending || isSearchLoading ? (
            <span className="flex items-center gap-1 text-primary">
              <SpinnerIcon className="h-3 w-3 animate-spin" />
              {isSearchLoading ? "Buscando…" : "Cargando…"}
            </span>
          ) : null}
        </div>
      </CommandDialog>
    </>
  );
}
