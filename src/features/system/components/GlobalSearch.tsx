import { useCallback, useEffect, useState, useMemo, useTransition, type ElementType } from "react";
import { routeLoaders } from "@/app-routes/routes-config";
import { CalendarDays, FleetIcon, UsersIcon, DocumentIcon, BookOpen, ScrollText, DeliveryIcon, ClipboardCheck, InvoiceIcon, MaintenanceIcon, WarnIcon, InventoryIcon, SupplierIcon, ExpenseIcon, ChartIcon, ActivityIcon, HistoryIcon, SettingsIcon, CompanyIcon, SecurityIcon, HelpIcon, TargetIcon, DashboardIcon, SearchIcon, SpinnerIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useEntitySearch } from "@/features/system/hooks/useEntitySearch";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifyError } from "@/lib/ui/appFeedback";

type Item = { title: string; url: string; icon: ElementType; group: string; keywords?: string };

const ITEMS: Item[] = [
  { title: "Panel", url: "/", icon: DashboardIcon, group: "General" },
  { title: "Calendario", url: "/calendar", icon: CalendarDays, group: "General", keywords: "gantt reservas" },
  { title: "CRM", url: "/crm", icon: TargetIcon, group: "Comercial", keywords: "prospectos pipeline" },
  { title: "Clientes", url: "/customers", icon: UsersIcon, group: "Comercial" },
  { title: "Cotizaciones", url: "/quotes", icon: DocumentIcon, group: "Comercial" },
  { title: "Reservas", url: "/bookings", icon: BookOpen, group: "Comercial" },
  { title: "Contratos", url: "/contracts", icon: ScrollText, group: "Operaciones" },
  { title: "Entregas", url: "/deliveries", icon: DeliveryIcon, group: "Operaciones" },
  { title: "Devoluciones", url: "/returns", icon: ClipboardCheck, group: "Operaciones" },
  { title: "Facturas", url: "/invoices", icon: InvoiceIcon, group: "Operaciones" },
  { title: "Equipos", url: "/fleet", icon: FleetIcon, group: "Flota", keywords: "montacargas" },
  { title: "Mantenimiento", url: "/maintenance", icon: MaintenanceIcon, group: "Flota" },
  { title: "Daños", url: "/damage", icon: WarnIcon, group: "Flota" },
  { title: "Refacciones", url: "/inventory", icon: InventoryIcon, group: "Flota" },
  { title: "Proveedores", url: "/suppliers", icon: SupplierIcon, group: "Administración" },
  { title: "Gastos operativos", url: "/expenses", icon: ExpenseIcon, group: "Administración" },
  { title: "Estado de resultados", url: "/income-statement", icon: ChartIcon, group: "Administración" },
  { title: "Reportes", url: "/reports", icon: ChartIcon, group: "Administración" },
  { title: "Actividad", url: "/activity", icon: ActivityIcon, group: "Administración" },
  { title: "Bitácora", url: "/audit", icon: HistoryIcon, group: "Administración", keywords: "auditoria audit trail" },
  { title: "Configuración operativa", url: "/settings/operations", icon: SettingsIcon, group: "Administración" },
  { title: "Datos fiscales", url: "/settings/company", icon: CompanyIcon, group: "Administración" },
  { title: "Usuarios", url: "/users", icon: SecurityIcon, group: "Administración" },
  { title: "Historial de cambios", url: "/changelog", icon: ScrollText, group: "Administración" },
  { title: "Ayuda", url: "/help", icon: HelpIcon, group: "Administración" },
];

const SECTION_LABELS: Record<string, string> = {
  invoices: "Facturas", customers: "Clientes", bookings: "Reservas", deliveries: "Entregas", returns: "Devoluciones",
};

/**
 * L-6a: fallo parcial de una sección — avisar en vez de mostrarla vacía como
 * si simplemente no hubiera coincidencias.
 */
function SearchPartialErrors({ errors }: { errors?: Record<string, string> }) {
  const failed = Object.keys(errors ?? {}).map((k) => SECTION_LABELS[k] ?? k);
  if (failed.length === 0) return null;
  return (
    <div className="px-3 py-2 text-xs text-warning" role="status">
      No se pudo buscar en: {failed.join(", ")}. Intenta de nuevo.
    </div>
  );
}

type EntityHit = { id: string; label: string; sub?: string; url: string };
type EntityGroup = { heading: string; prefix: string; hits: EntityHit[]; mono: boolean };

/** Grupos de entidades encontradas (facturas, clientes, reservas, entregas, devoluciones). */
function EntitySearchResults({
  entities, isPending, onSelect,
}: {
  entities: { invoices: EntityHit[]; customers: EntityHit[]; bookings: EntityHit[]; deliveries: EntityHit[]; returns: EntityHit[] };
  isPending: boolean;
  onSelect: (url: string) => void;
}) {
  const sections: EntityGroup[] = [
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
            <CommandItem key={e.id} value={`${s.prefix} ${e.label} ${e.sub ?? ""}`} onSelect={() => onSelect(e.url)} disabled={isPending}>
              {s.prefix === "fac" ? <InvoiceIcon className="mr-2 h-4 w-4" />
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

export function GlobalSearch() {
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
    const map = new Map<string, Item[]>();
    ITEMS.forEach((i) => {
      const arr = map.get(i.group) ?? [];
      arr.push(i);
      map.set(i.group, arr);
    });
    return [...map.entries()];
  }, []);

  const entityQuery = useEntitySearch(debouncedInput, open);
  const entities = entityQuery.data;
  const hasEntities = !!entities && (entities.invoices.length + entities.customers.length + entities.bookings.length + entities.deliveries.length + entities.returns.length > 0);

  const go = (url: string) => {
    setOpen(false);
    startTransition(() => {
      try {
        navigate(url);
      } catch (err) {
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
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-2 text-muted-foreground hover:text-foreground px-2.5 touch:h-11 touch:min-w-11"
        aria-label="Navegación rápida"
      >
        <SearchIcon className="h-3.5 w-3.5" />
        <span className="hidden md:inline text-xs">Ir a…</span>
        <Badge variant="secondary" className="hidden md:inline-flex text-3xs px-1.5 py-0 font-mono opacity-70">
          Ctrl+K
        </Badge>
      </Button>

      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        {/* shouldFilter=false: entidades se filtran server-side; para páginas
            usamos el `value` que incluye keywords y cmdk filtra localmente. */}
        <CommandInput
          placeholder="Buscar módulo, factura, cliente o reserva…"
          value={input}
          onValueChange={setInput}
        />
        <CommandList>
          <CommandEmpty>
            <div className="flex flex-col items-center gap-1 py-4 text-xs text-muted-foreground">
              <span>Sin resultados.</span>
              <span className="opacity-70">Prueba con otro término o revisa la ortografía.</span>
            </div>
          </CommandEmpty>

          <SearchPartialErrors errors={entities?.errors} />

          {hasEntities && (
            <EntitySearchResults entities={entities} isPending={isPending} onSelect={go} />
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
          {isPending || entityQuery.isFetching ? (
            <span className="flex items-center gap-1 text-primary">
              <SpinnerIcon className="h-3 w-3 animate-spin" />
              {entityQuery.isFetching ? "Buscando…" : "Cargando…"}
            </span>
          ) : null}
        </div>
      </CommandDialog>
    </>
  );
}
