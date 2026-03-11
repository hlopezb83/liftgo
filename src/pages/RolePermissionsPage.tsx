import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Eye, Minus } from "lucide-react";
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

export default function RolePermissionsPage() {
  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader
          title="Permisos por Rol"
          subtitle="Consulta los permisos de acceso de cada rol a los módulos del sistema."
        />

        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[calc(100vh-14rem)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold min-w-[160px] border-b">Módulo</th>
                    {STAFF_ROLES.map((r) => (
                      <th key={r} className="px-3 py-3 text-center min-w-[100px] border-b">
                        <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", ROLE_COLORS[r])}>
                          {ROLE_LABELS[r]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((mod, i) => (
                    <tr key={mod} className={cn("border-b last:border-b-0", i % 2 === 0 && "bg-muted/20")}>
                      <td className="px-4 py-2.5 font-medium">{mod}</td>
                      {STAFF_ROLES.map((r) => {
                        const access = getAccess(r, mod);
                        return (
                          <td key={r} className="px-3 py-2.5 text-center">
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
          </CardContent>
        </Card>

        <div className="flex gap-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Acceso completo</span>
          <span className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-blue-500" /> Solo lectura</span>
          <span className="flex items-center gap-1.5"><Minus className="h-3.5 w-3.5 text-muted-foreground/40" /> Sin acceso</span>
        </div>
      </div>
    </PageTransition>
  );
}
