import { useId } from "react";
import { DeleteIcon, EditIcon, KeyIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { STAFF_ROLES } from "@/lib/constants";
import { formatDateMty } from "@/lib/format/dateFormats";
import { RoleBadge } from "./RoleBadge";
import type { UserRow } from "../../hooks/useUserManagement";
import type { AppRole } from "../../hooks/useUserRole";

export interface UserRowActions {
  currentUserId?: string;
  isToggling: boolean;
  lastAdminId?: string;
  onRoleChange: (u: UserRow, role: AppRole) => void;
  onToggleStatus: (userId: string, active: boolean) => void;
  onEdit: (u: UserRow) => void;
  onSetPassword: (u: UserRow) => void;
  onDelete: (u: UserRow) => void;
}

function UserMobileRole({ u, actions, protectionHintId, canManage }: { u: UserRow; actions: UserRowActions; protectionHintId?: string; canManage: boolean }) {
  if (!canManage) return <RoleBadge role={u.role} />;
  return <Select value={u.role ?? ""} onValueChange={(val) => actions.onRoleChange(u, val as AppRole)}>
    <SelectTrigger className="w-full" disabled={!!protectionHintId} aria-describedby={protectionHintId}><SelectValue /></SelectTrigger>
    <SelectContent>
      {STAFF_ROLES.map((r) => <SelectItem key={r} value={r}><RoleBadge role={r} /></SelectItem>)}
    </SelectContent>
  </Select>;
}


function UserMobileAccountControls({ u, actions, canManage, isSelf, isLastAdmin }: {
  u: UserRow;
  actions: UserRowActions;
  canManage: boolean;
  isSelf: boolean;
  isLastAdmin: boolean;
}) {
  const hintId = useId();
  const protectionHintId = canManage && isLastAdmin ? hintId : undefined;
  const statusLabel = u.is_active ? "Activo" : "Inactivo";
  const accountName = u.full_name?.trim() || u.email || "esta cuenta";
  return (
    <>
      <UserMobileRole u={u} actions={actions} canManage={canManage} protectionHintId={protectionHintId} />
      {protectionHintId && <p id={protectionHintId} className="mt-1 text-xs text-muted-foreground">Es el único administrador activo. Su rol y estado están protegidos.</p>}
      {canManage && !isSelf && (
        <div className="flex items-center gap-2 mt-3">
          <Switch
            aria-label={`Estado de ${accountName}`}
            aria-describedby={protectionHintId}
            checked={u.is_active}
            onCheckedChange={() => actions.onToggleStatus(u.user_id, u.is_active)}
            disabled={actions.isToggling || isLastAdmin}
          />
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
        </div>
      )}
      {!canManage && <p className="mt-3 text-xs text-muted-foreground">{statusLabel}</p>}
    </>
  );
}

export function UserMobileCard({ u, actions, canManage }: { u: UserRow; actions: UserRowActions; canManage: boolean }) {
  const isSelf = u.user_id === actions.currentUserId;
  const isLastAdmin = u.user_id === actions.lastAdminId;
  return (
    <Card className={!u.is_active ? "opacity-60" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{u.full_name ?? "—"}</span>
            {isSelf && <Badge variant="outline" className="text-3xs px-1.5">Tú</Badge>}
            {canManage && !u.is_active && <Badge variant="destructive" className="text-3xs px-1.5">Inactivo</Badge>}
          </div>
          {canManage && <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => actions.onEdit(u)} aria-label="Editar usuario">
              <EditIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => actions.onSetPassword(u)} aria-label="Asignar contraseña">
              <KeyIcon className="h-4 w-4" />
            </Button>
            {!isSelf && !isLastAdmin && (
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => actions.onDelete(u)} aria-label="Eliminar usuario">
                <DeleteIcon className="h-4 w-4" />
              </Button>
            )}
          </div>}
        </div>
        <p className="text-xs text-muted-foreground mb-1">{u.email ?? "—"}</p>
        <p className="text-xs text-muted-foreground mb-2">{formatDateMty(u.created_at)}</p>
        <UserMobileAccountControls u={u} actions={actions} canManage={canManage} isSelf={isSelf} isLastAdmin={isLastAdmin} />
      </CardContent>
    </Card>
  );
}
