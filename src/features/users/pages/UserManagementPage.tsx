import { useLiftgoTable } from "@/components/dataTable/v2";
import { SearchBar } from "@/components/forms/SearchBar";
import { SecurityIcon, UsersIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { STAFF_ROLES } from "@/lib/constants";
import { CredentialsDialog } from "../components/users/CredentialsDialog";
import { DeleteUserDialog } from "../components/users/DeleteUserDialog";
import { EditNameDialog } from "../components/users/EditNameDialog";
import { InviteUserDialog } from "../components/users/InviteUserDialog";
import { RoleBadge } from "../components/users/RoleBadge";
import { RoleChangeDialog } from "../components/users/RoleChangeDialog";
import { useUserManagementColumns } from "../hooks/users/useUserManagementColumns";
import { useUserManagementDialogs } from "../hooks/users/useUserManagementDialogs";
import { useUsersWithRoles, useToggleStatus, type UserRow } from "../hooks/useUserManagement";
import type { AppRole } from "../hooks/useUserRole";

import { useUserManagementFilters } from "../hooks/users/useUserManagementFilters";
import { SetPasswordDialog } from "../components/users/SetPasswordDialog";
import { UserMobileCard } from "../components/users/UserMobileCard";

type UserItem = UserRow & { id?: string };

export default function UserManagementPage() {
  const navigate = useNavigateTransition();
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsersWithRoles();
  const toggleStatus = useToggleStatus();

  const dialogs = useUserManagementDialogs();
  const { search, setSearch, filterRole, setFilterRole, filtered } = useUserManagementFilters(users);
  const { setEditTarget, setPasswordTarget, setDeleteTarget, setRoleChangeTarget } = dialogs;

  const onRoleChange = (u: UserRow, newRole: AppRole) => setRoleChangeTarget({ user: u, newRole });
  const onToggleStatus = (userId: string, currentActive: boolean) => {
    toggleStatus.mutate({ userId, isActive: !currentActive });
  };
  const onEdit = (u: UserRow) => setEditTarget(u);
  const onSetPassword = (u: UserRow) => setPasswordTarget(u);
  const onDelete = (u: UserRow) => setDeleteTarget(u);

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
              <SecurityIcon className="mr-2 h-4 w-4" />Ver permisos
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
        emptyIcon={UsersIcon}
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
