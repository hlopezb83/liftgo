
import type { ColumnDef } from "@/components/dataTable/v2";
import { DeleteIcon, EditIcon, KeyIcon, ShieldCheck as ShieldIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { STAFF_ROLES } from "@/lib/constants";
import { formatDateMty } from "@/lib/format/dateFormats";
import { RoleBadge } from "../../components/users/RoleBadge";
import type { UserRow } from "../useUserManagement";
import type { AppRole } from "../useUserRole";

type UserItem = UserRow & { id?: string };

interface Params {
  currentUserId?: string;
  isToggling: boolean;
  onRoleChange: (u: UserRow, role: AppRole) => void;
  onToggleStatus: (userId: string, active: boolean) => void;
  onEdit: (u: UserRow) => void;
  onSetPassword: (u: UserRow) => void;
  onDelete: (u: UserRow) => void;
}

export function useUserManagementColumns({
  currentUserId, isToggling, onRoleChange, onToggleStatus, onEdit, onSetPassword, onDelete,
}: Params): ColumnDef<UserItem>[] {
  return [
      {
        id: "full_name",
        header: "Nombre",
        accessorFn: (u) => u.full_name ?? "",
        cell: ({ row }) => {
          const u = row.original;
          const isSelf = u.user_id === currentUserId;
          return (
            <div className="flex items-center gap-2 font-medium">
              {u.full_name ?? "—"}
              {isSelf && <Badge variant="outline" className="text-[10px] px-1.5">Tú</Badge>}
            </div>
          );
        },
      },
      {
        id: "email",
        header: "Email",
        accessorFn: (u) => u.email ?? "",
        cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.original.email ?? "—"}</span>,
      },
      {
        id: "created_at",
        header: "Fecha de Registro",
        accessorKey: "created_at",
        cell: ({ row }) => <span className="text-muted-foreground text-sm">{formatDateMty(row.original.created_at)}</span>,
      },
      {
        id: "role",
        header: "Rol",
        accessorKey: "role",
        cell: ({ row }) => (
          <Select defaultValue={row.original.role} onValueChange={(val) => onRoleChange(row.original, val as AppRole)}>
            <SelectTrigger className="w-[160px]" onClick={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAFF_ROLES.map((r) => (
                <SelectItem key={r} value={r}><RoleBadge role={r} /></SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
      {
        id: "status",
        header: "Estado",
        accessorFn: (u) => (u.is_active ? "Activo" : "Inactivo"),
        cell: ({ row }) => {
          const u = row.original;
          const isSelf = u.user_id === currentUserId;
          return !isSelf ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
              <Switch checked={u.is_active} onCheckedChange={() => onToggleStatus(u.user_id, u.is_active)} disabled={isToggling} />
              <span className="text-xs text-muted-foreground">{u.is_active ? "Activo" : "Inactivo"}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldIcon className="h-3.5 w-3.5" /> Activo
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Acciones",
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original;
          const isSelf = u.user_id === currentUserId;
          return (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
              <Button variant="ghost" size="icon" title="Editar nombre" onClick={() => onEdit(u)}>
                <EditIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Asignar contraseña" onClick={() => onSetPassword(u)}>
                <KeyIcon className="h-4 w-4" />
              </Button>
              {!isSelf && (
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Eliminar" onClick={() => onDelete(u)}>
                  <DeleteIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        },
      },
    ];
}
