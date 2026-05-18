import { TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, KeyRound, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { STAFF_ROLES } from "@/lib/constants";
import { RoleBadge } from "@/features/users/components/users/RoleBadge";
import type { UserRow } from "@/features/users/hooks/useUserManagement";
import type { AppRole } from "@/features/users/hooks/useUserRole";

export interface UserRowActions {
  currentUserId?: string;
  isToggling: boolean;
  onRoleChange: (u: UserRow, role: AppRole) => void;
  onToggleStatus: (userId: string, active: boolean) => void;
  onEdit: (u: UserRow) => void;
  onSetPassword: (u: UserRow) => void;
  onDelete: (u: UserRow) => void;
}

export function UserDesktopRow({ u, actions }: { u: UserRow; actions: UserRowActions }) {
  const isSelf = u.user_id === actions.currentUserId;
  return (
    <TableRow key={u.user_id} className={!u.is_active ? "opacity-60" : ""}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {u.full_name ?? "—"}
          {isSelf && <Badge variant="outline" className="text-[10px] px-1.5">Tú</Badge>}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{u.email ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {format(new Date(u.created_at), "dd/MM/yyyy")}
      </TableCell>
      <TableCell>
        <Select defaultValue={u.role} onValueChange={(val) => actions.onRoleChange(u, val as AppRole)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((r) => (
              <SelectItem key={r} value={r}><RoleBadge role={r} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {!isSelf ? (
          <div className="flex items-center gap-2">
            <Switch checked={u.is_active} onCheckedChange={() => actions.onToggleStatus(u.user_id, u.is_active)} disabled={actions.isToggling} />
            <span className="text-xs text-muted-foreground">{u.is_active ? "Activo" : "Inactivo"}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Activo
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" title="Editar nombre" onClick={() => actions.onEdit(u)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Asignar contraseña" onClick={() => actions.onSetPassword(u)}>
            <KeyRound className="h-4 w-4" />
          </Button>
          {!isSelf && (
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Eliminar" onClick={() => actions.onDelete(u)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
