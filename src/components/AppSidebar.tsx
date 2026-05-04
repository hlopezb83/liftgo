import { useMemo, useState } from "react";
import { LayoutDashboard, Truck, CalendarDays, BookOpen, Users, Wrench, Receipt, Settings, ClipboardCheck, TruckIcon, FileText, Activity, BarChart3, AlertTriangle, LogOut, ShieldCheck, Moon, Sun, Building2, ScrollText, History, HelpCircle, Wallet, Package, Target, DollarSign, Handshake, KeyRound } from "lucide-react";
import { useTheme } from "next-themes";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import type { AppRole } from "@/hooks/useUserRole";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useRolePermissions, ROUTE_TO_MODULE, type AccessLevel } from "@/hooks/useRolePermissions";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { useCurrentVersion } from "@/hooks/useChangelog";
import { ROLE_LABELS } from "@/lib/constants";

type NavItem = { title: string; url: string; icon: React.ElementType };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "General",
    items: [
      { title: "Panel", url: "/", icon: LayoutDashboard },
      { title: "Calendario", url: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Comercial",
    items: [
      { title: "CRM", url: "/crm", icon: Target },
      { title: "Clientes", url: "/customers", icon: Users },
      { title: "Cotizaciones", url: "/quotes", icon: FileText },
      { title: "Reservas", url: "/bookings", icon: BookOpen },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { title: "Contratos", url: "/contracts", icon: ScrollText },
      { title: "Entregas", url: "/deliveries", icon: TruckIcon },
      { title: "Devoluciones", url: "/returns", icon: ClipboardCheck },
      { title: "Facturas", url: "/invoices", icon: Receipt },
    ],
  },
  {
    label: "Flota y Mantenimiento",
    items: [
      { title: "Equipos", url: "/fleet", icon: Truck },
      { title: "Mantenimiento", url: "/maintenance", icon: Wrench },
      { title: "Daños", url: "/damage", icon: AlertTriangle },
      { title: "Refacciones", url: "/inventory", icon: Package },
    ],
  },
  {
    label: "Administración",
    items: [
      { title: "Proveedores", url: "/suppliers", icon: Handshake },
      { title: "Gastos Operativos", url: "/expenses", icon: Wallet },
      { title: "Estado de Resultados", url: "/income-statement", icon: DollarSign },
      { title: "Reportes", url: "/reports", icon: BarChart3 },
      { title: "Actividad", url: "/activity", icon: Activity },
      { title: "Bitácora", url: "/audit", icon: History },
      { title: "Configuración", url: "/settings/operations", icon: Settings },
      { title: "Datos Fiscales", url: "/settings/company", icon: Building2 },
      { title: "Usuarios", url: "/users", icon: ShieldCheck },
      { title: "Changelog", url: "/changelog", icon: ScrollText },
      { title: "Ayuda", url: "/help", icon: HelpCircle },
    ],
  },
];

// Items that are always visible (no permission check)
const ALWAYS_VISIBLE = ["/changelog", "/help", "/activity", "/audit"];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function getItemAccess(perms: Record<string, Record<string, AccessLevel>> | undefined, role: AppRole | undefined, url: string): AccessLevel {
  if (!perms || !role) return "none";
  if (ALWAYS_VISIBLE.includes(url)) return "full";
  const module = ROUTE_TO_MODULE[url];
  if (!module) return "full";
  return perms[role]?.[module] ?? "none";
}

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { data: role } = useUserRole();
  const { data: company } = useCompanySettings();
  const { data: perms } = useRolePermissions();
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const currentVersion = useCurrentVersion();

  // Memoizar el árbol de navegación filtrado: solo se recalcula cuando cambia rol o permisos.
  const visibleNavGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        label: group.label,
        items: group.items.filter((item) => getItemAccess(perms, role, item.url) !== "none"),
      }))
      .filter((group) => group.items.length > 0);
  }, [perms, role]);

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {company?.logo_url ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white p-1">
              <img src={company.logo_url} alt="Logo" className="h-full w-full rounded object-contain" />
            </div>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--accent-gold))] text-white font-bold text-sm">LG</div>
          )}
          <div>
            <h2 className="text-sm font-bold text-sidebar-primary-foreground tracking-tight">{company?.razon_social || "Lift Go"}</h2>
            <p className="text-xs text-sidebar-foreground/60">Montacargas</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {visibleNavGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} end={item.url === "/"} className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors" activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">{user?.email}</p>
          <div className="flex gap-1">
            <ThemeToggle />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setPwDialogOpen(true)} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
                  <KeyRound className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cambiar contraseña</TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {currentVersion && (
          <NavLink to="/changelog" className="text-[10px] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors font-mono">
            v{currentVersion}
          </NavLink>
        )}
        <ChangePasswordDialog open={pwDialogOpen} onOpenChange={setPwDialogOpen} />
      </SidebarFooter>
    </Sidebar>
  );
}
