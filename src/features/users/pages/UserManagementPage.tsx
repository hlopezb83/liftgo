import { useCallback, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, KeyRound, ShieldCheck, ShieldCheck as ShieldIcon, Users } from "lucide-react";
import { format } from "date-fns";
import { SearchBar } from "@/components/SearchBar";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ListPageLayout } from "@/components/ListPageLayout";
import { STAFF_ROLES } from "@/lib/constants";
import type { AppRole } from "@/features/users/hooks/useUserRole";

import { useUsersWithRoles, useToggleStatus, type UserRow } from "@/features/users/hooks/useUserManagement";
import { useUserManagementDialogs } from "@/features/users/hooks/users/useUserManagementDialogs";
import { useUserManagementFilters } from "@/features/users/hooks/users/useUserManagementFilters";
import { CredentialsDialog } from "@/features/users/components/users/CredentialsDialog";
import { InviteUserDialog } from "@/features/users/components/users/InviteUserDialog";
import { EditNameDialog } from "@/features/users/components/users/EditNameDialog";
import { DeleteUserDialog } from "@/features/users/components/users/DeleteUserDialog";
import { RoleChangeDialog } from "@/features/users/components/users/RoleChangeDialog";
import { SetPasswordDialog } from "@/features/users/components/users/SetPasswordDialog";
import { RoleBadge } from "@/features/users/components/users/RoleBadge";
import { UserMobileCard } from "@/features/users/components/users/UserMobileCard";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

type UserItem = UserRow & { id?: string };

export default function UserManagementPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsersWithRoles();
  const toggleStatus = useToggleStatus();

  const dialogs = useUserManagementDialogs();
  const { search, setSearch, filterRole, setFilterRole, filtered } = useUserManagementFilters(users);
  const { setEditTarget, setPasswordTarget, setDeleteTarget, setRoleChangeTarget } = dialogs;

  const onRoleChange = useCallback((u: UserRow, newRole: AppRole) => setRoleChangeTarget({ user: u, newRole }), [setRoleChangeTarget]);
  const onToggleStatus = useCallback((userId: string, currentActive: boolean) => {
    toggleStatus.mutate({ userId, isActive: !currentActive });
  }, [toggleStatus]);
  const onEdit = useCallback((u: UserRow) => setEditTarget(u), [setEditTarget]);
  const onSetPassword = useCallback((u: UserRow) => setPasswordTarget(u), [setPasswordTarget]);
  const onDelete = useCallback((u: UserRow) => setDeleteTarget(u), [setDeleteTarget]);

  const columns = useMemo<ColumnDef<UserItem>[]>(
    () => [
      {
        id: "full_name",
        header: "Nombre",
        accessorFn: (u) => u.full_name ?? "",
        cell: ({ row }) => {
          const u = row.original;
          const isSelf = u.user_id === currentUser?.id;
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
        cell: ({ row }) => <span className="text-muted-foreground text-sm">{format(new Date(row.original.created_at), "dd/MM/yyyy")}</span>,
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
          const isSelf = u.user_id === currentUser?.id;
          return !isSelf ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Switch checked={u.is_active} onCheckedChange={() => onToggleStatus(u.user_id, u.is_active)} disabled={toggleStatus.isPending} />
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
          const isSelf = u.user_id === currentUser?.id;
          return (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" title="Editar nombre" onClick={() => onEdit(u)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" title="Asignar contraseña" onClick={() => onSetPassword(u)}>
                <KeyRound className="h-4 w-4" />
              </Button>
              {!isSelf && (
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Eliminar" onClick={() => onDelete(u)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [currentUser?.id, onRoleChange, onToggleStatus, onEdit, onSetPassword, onDelete, toggleStatus.isPending],
  );

  const table = useLiftgoTable<UserItem>({
    data: filtered,
    columns,
    getRowId: (u) => u.user_id,
  });

  return (
    <>
      <ListPageLayout<UserItem>
        title="Gestión de Usuarios"
        subtitle="Ver y administrar roles de usuarios"
        totalCount={filtered.length}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/users/permissions")}>
              <ShieldCheck className="mr-2 h-4 w-4" />Ver permisos
            </Button>
            <InviteUserDialog onCreated={() => {}} />
          </div>
        }
        filters={
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre o email…" className="flex-1 max-w-md" />
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar por rol" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r} value={r}><RoleBadge role={r} /></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        isLoading={isLoading}
        table={table}
        emptyMessage="No hay usuarios"
        emptyIcon={Users}
        skeletonColumns={6}
        mobileCardRender={(u) => (
          <UserMobileCard
            u={u}
            actions={{
              currentUserId: currentUser?.id,
              isToggling: toggleStatus.isPending,
              onRoleChange,
              onToggleStatus,
              onEdit,
              onSetPassword,
              onDelete,
            }}
          />
        )}
        mobileKeyExtractor={(u) => u.user_id}
      />

      <DeleteUserDialog user={dialogs.deleteTarget} onClose={() => dialogs.setDeleteTarget(null)} />
      <RoleChangeDialog target={dialogs.roleChangeTarget} onClose={() => dialogs.setRoleChangeTarget(null)} />
      <EditNameDialog user={dialogs.editTarget} onClose={() => dialogs.setEditTarget(null)} />
      <CredentialsDialog email={dialogs.createdEmail} onClose={() => dialogs.setCreatedEmail(null)} />
      <SetPasswordDialog user={dialogs.passwordTarget} onClose={() => dialogs.setPasswordTarget(null)} />
    </>
  );
}
