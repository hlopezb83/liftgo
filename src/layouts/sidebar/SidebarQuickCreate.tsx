import { AddIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { useRolePermissions, useUserRole } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";

type CreateAction = {
  label: string;
  to: string;
  module: string;
  requiresFull?: boolean;
  adminOnly?: boolean;
};

// Mismos módulos/gating que routes-config.tsx:
// - /bookings/new       → adminOnly
// - /invoices/new       → minAccess "full"
// - /quotes/new         → módulo Cotizaciones (read+)
// - /customers?new=1    → módulo Clientes (read+)
const ACTIONS: CreateAction[] = [
  { label: "Nueva Reserva", to: "/bookings/new", module: "Reservas", adminOnly: true },
  { label: "Nueva Cotización", to: "/quotes/new", module: "Cotizaciones" },
  { label: "Nueva Factura", to: "/invoices/new", module: "Facturas", requiresFull: true },
  { label: "Nuevo Cliente", to: "/customers?new=1", module: "Clientes" },
];

export function SidebarQuickCreate() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigateTransition();
  const { data: role } = useUserRole();
  const { data: permissions } = useRolePermissions();

  const allowed = ACTIONS.filter((a) => {
    if (a.adminOnly) return role === "admin";
    const access = permissions?.[role ?? ""]?.[a.module];
    if (!access || access === "none") return false;
    return a.requiresFull ? access === "full" : true;
  });

  if (allowed.length === 0) return null;

  return (
    <div className={collapsed ? "px-2 py-2" : "px-3 py-2"}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className={collapsed ? "h-9 w-9 p-0" : "w-full justify-start gap-2"}
            aria-label="Crear nuevo"
          >
            <AddIcon className="h-4 w-4" />
            {!collapsed && <span>Nuevo</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={collapsed ? "right" : "bottom"} align="start">
          {allowed.map((a) => (
            <DropdownMenuItem key={a.to} onSelect={() => navigate(a.to)}>
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
