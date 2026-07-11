import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays, Truck, Users, FileText, BookOpen, ScrollText, TruckIcon,
  ClipboardCheck, Receipt, Wrench, AlertTriangle, Package, Handshake,
  Wallet, DollarSign, BarChart3, Activity, History, Settings, Building2,
  ShieldCheck, HelpCircle, Target, LayoutDashboard, Search,
} from "@/components/icons";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Item = { title: string; url: string; icon: React.ElementType; group: string; keywords?: string };

const ITEMS: Item[] = [
  { title: "Panel", url: "/", icon: LayoutDashboard, group: "General" },
  { title: "Calendario", url: "/calendar", icon: CalendarDays, group: "General", keywords: "gantt reservas" },
  { title: "CRM", url: "/crm", icon: Target, group: "Comercial", keywords: "prospectos pipeline" },
  { title: "Clientes", url: "/customers", icon: Users, group: "Comercial" },
  { title: "Cotizaciones", url: "/quotes", icon: FileText, group: "Comercial" },
  { title: "Reservas", url: "/bookings", icon: BookOpen, group: "Comercial" },
  { title: "Contratos", url: "/contracts", icon: ScrollText, group: "Operaciones" },
  { title: "Entregas", url: "/deliveries", icon: TruckIcon, group: "Operaciones" },
  { title: "Devoluciones", url: "/returns", icon: ClipboardCheck, group: "Operaciones" },
  { title: "Facturas", url: "/invoices", icon: Receipt, group: "Operaciones" },
  { title: "Equipos", url: "/fleet", icon: Truck, group: "Flota", keywords: "montacargas" },
  { title: "Mantenimiento", url: "/maintenance", icon: Wrench, group: "Flota" },
  { title: "Daños", url: "/damage", icon: AlertTriangle, group: "Flota" },
  { title: "Refacciones", url: "/inventory", icon: Package, group: "Flota" },
  { title: "Proveedores", url: "/suppliers", icon: Handshake, group: "Administración" },
  { title: "Gastos Operativos", url: "/expenses", icon: Wallet, group: "Administración" },
  { title: "Estado de Resultados", url: "/income-statement", icon: DollarSign, group: "Administración" },
  { title: "Reportes", url: "/reports", icon: BarChart3, group: "Administración" },
  { title: "Actividad", url: "/activity", icon: Activity, group: "Administración" },
  { title: "Bitácora", url: "/audit", icon: History, group: "Administración", keywords: "auditoria audit trail" },
  { title: "Configuración Operativa", url: "/settings/operations", icon: Settings, group: "Administración" },
  { title: "Datos Fiscales", url: "/settings/company", icon: Building2, group: "Administración" },
  { title: "Usuarios", url: "/users", icon: ShieldCheck, group: "Administración" },
  { title: "Changelog", url: "/changelog", icon: ScrollText, group: "Administración" },
  { title: "Ayuda", url: "/help", icon: HelpCircle, group: "Administración" },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        const isInput = tag === "input" || tag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable;
        if (isInput) return; // dejar a SearchBar de la página
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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

  const go = (url: string) => {
    setOpen(false);
    navigate(url);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-2 text-muted-foreground hover:text-foreground px-2.5 touch:h-11 touch:min-w-11"
        aria-label="Búsqueda global"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden md:inline text-xs">Buscar…</span>
        <Badge variant="secondary" className="hidden md:inline-flex text-[10px] px-1.5 py-0 font-mono opacity-70">
          Ctrl+K
        </Badge>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar módulo o ir a…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          {groups.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => (
                <CommandItem
                  key={item.url}
                  value={`${item.title} ${item.keywords ?? ""}`}
                  onSelect={() => go(item.url)}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
