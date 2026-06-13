import { useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Users } from "lucide-react";
import { SearchBar } from "@/components/forms/SearchBar";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { STAFF_ROLES } from "@/lib/constants";
import type { AppRole } from "@/features/users/hooks/useUserRole";

import { useUsersWithRoles, useToggleStatus, type UserRow } from "@/features/users/hooks/useUserManagement";
import { useUserManagementDialogs } from "@/features/users/hooks/users/useUserManagementDialogs";
import { useUserManagementFilters } from "@/features/users/hooks/users/useUserManagementFilters";
import { useUserManagementColumns } from "@/features/users/hooks/users/useUserManagementColumns";
import { CredentialsDialog } from "@/features/users/components/users/CredentialsDialog";
import { InviteUserDialog } from "@/features/users/components/users/InviteUserDialog";
import { EditNameDialog } from "@/features/users/components/users/EditNameDialog";
import { DeleteUserDialog } from "@/features/users/components/users/DeleteUserDialog";
import { RoleChangeDialog } from "@/features/users/components/users/RoleChangeDialog";
import { SetPasswordDialog } from "@/features/users/components/users/SetPasswordDialog";
import { RoleBadge } from "@/features/users/components/users/RoleBadge";
import { UserMobileCard } from "@/features/users/components/users/UserMobileCard";
import { useLiftgoTable } from "@/components/dataTable/v2";

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

  const columns = useUserManagementColumns({
    currentUserId: currentUser?.id,
    isToggling: toggleStatus.isPending,
    onRoleChange,
    onToggleStatus,
    onEdit,
    onSetPassword,
    onDelete,
  });

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
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre o correo…" className="flex-1 max-w-md" />
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
