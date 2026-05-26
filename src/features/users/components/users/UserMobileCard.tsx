import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Pencil, KeyRound } from "lucide-react";
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


export function UserMobileCard({ u, actions }: { u: UserRow; actions: UserRowActions }) {
  const isSelf = u.user_id === actions.currentUserId;
  return (
    <Card className={!u.is_active ? "opacity-60" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{u.full_name ?? "—"}</span>
            {isSelf && <Badge variant="outline" className="text-[10px] px-1.5">Tú</Badge>}
            {!u.is_active && <Badge variant="destructive" className="text-[10px] px-1.5">Inactivo</Badge>}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => actions.onEdit(u)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => actions.onSetPassword(u)}>
              <KeyRound className="h-4 w-4" />
            </Button>
            {!isSelf && (
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => actions.onDelete(u)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-1">{u.email ?? "—"}</p>
        <p className="text-xs text-muted-foreground mb-2">{format(new Date(u.created_at), "dd/MM/yyyy")}</p>
        <Select defaultValue={u.role} onValueChange={(val) => actions.onRoleChange(u, val as AppRole)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((r) => (
              <SelectItem key={r} value={r}><RoleBadge role={r} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isSelf && (
          <div className="flex items-center gap-2 mt-3">
            <Switch checked={u.is_active} onCheckedChange={() => actions.onToggleStatus(u.user_id, u.is_active)} disabled={actions.isToggling} />
            <span className="text-xs text-muted-foreground">{u.is_active ? "Activo" : "Inactivo"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
