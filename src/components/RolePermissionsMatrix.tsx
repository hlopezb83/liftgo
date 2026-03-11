import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, Check, Eye, Minus } from "lucide-react";
import { STAFF_ROLES, ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { ROLE_PERMISSIONS } from "@/components/RolePermissionsTooltip";
import type { AppRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

const MODULES = [
  "Dashboard",
  "Flota",
  "Reservas",
  "Calendario",
  "Entregas",
  "Facturas",
  "Pagos",
  "Contratos",
  "Cotizaciones",
  "Clientes",
  "CRM / Prospectos",
  "Mantenimiento",
  "Daños",
  "Refacciones",
  "Gastos",
  "Proveedores",
  "Reportes",
  "Configuración",
  "Gestión de Usuarios",
];

function getAccess(role: AppRole, module: string): "full" | "read" | "none" {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return "none";
  if (role === "admin") return "full";
  if (role === "auditor") return "read";
  if (module === "Gestión de Usuarios") return "none";
  if (perms.access.some((a) => module.includes(a) || a.includes(module))) return "full";
  if (perms.readOnly?.some((a) => module.includes(a) || a.includes(module))) return "read";
  return "none";
}

export function RolePermissionsMatrix() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
          Matriz de permisos por rol
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className="rounded-md border overflow-auto max-h-[420px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-semibold min-w-[140px]">Módulo</th>
                {STAFF_ROLES.map((r) => (
                  <th key={r} className="px-2 py-2 text-center min-w-[90px]">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", ROLE_COLORS[r])}>
                      {ROLE_LABELS[r]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod, i) => (
                <tr key={mod} className={cn("border-t", i % 2 === 0 && "bg-muted/20")}>
                  <td className="px-3 py-1.5 font-medium">{mod}</td>
                  {STAFF_ROLES.map((r) => {
                    const access = getAccess(r, mod);
                    return (
                      <td key={r} className="px-2 py-1.5 text-center">
                        {access === "full" && <Check className="h-4 w-4 text-emerald-500 mx-auto" />}
                        {access === "read" && <Eye className="h-4 w-4 text-blue-500 mx-auto" />}
                        {access === "none" && <Minus className="h-4 w-4 text-muted-foreground/40 mx-auto" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-4 mt-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-500" /> Acceso completo</span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-blue-500" /> Solo lectura</span>
          <span className="flex items-center gap-1"><Minus className="h-3 w-3 text-muted-foreground/40" /> Sin acceso</span>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
