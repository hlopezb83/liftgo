import { useCallback } from "react";
import { TableHead, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/SearchBar";
import { ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ListPageLayout } from "@/components/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";
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
import { UserDesktopRow, type UserRowActions } from "@/features/users/components/users/UserDesktopRow";
import { UserMobileCard } from "@/features/users/components/users/UserMobileCard";

export default function UserManagementPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsersWithRoles();
  const toggleStatus = useToggleStatus();

  const dialogs = useUserManagementDialogs();
  const { search, setSearch, filterRole, setFilterRole, filtered } = useUserManagementFilters(users);
  const { page, setPage, totalPages, paginatedItems } = useListPage(filtered);

  const { setEditTarget, setPasswordTarget, setDeleteTarget, setRoleChangeTarget } = dialogs;

  const actions: UserRowActions = {
    currentUserId: currentUser?.id,
    isToggling: toggleStatus.isPending,
    onRoleChange: useCallback((user: UserRow, newRole: AppRole) => setRoleChangeTarget({ user, newRole }), [setRoleChangeTarget]),
    onToggleStatus: useCallback((userId: string, currentActive: boolean) => {
      toggleStatus.mutate({ userId, isActive: !currentActive });
    }, [toggleStatus]),
    onEdit: useCallback((u: UserRow) => setEditTarget(u), [setEditTarget]),
    onSetPassword: useCallback((u: UserRow) => setPasswordTarget(u), [setPasswordTarget]),
    onDelete: useCallback((u: UserRow) => setDeleteTarget(u), [setDeleteTarget]),
  };

  return (
    <>
      <ListPageLayout<UserRow & { id?: string }>
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
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No hay usuarios"
        emptyIcon={Users}
        skeletonColumns={6}
        tableHeader={
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Fecha de Registro</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        }
        renderRow={(u) => <UserDesktopRow u={u as UserRow} actions={actions} />}
        mobileCardRender={(u) => <UserMobileCard u={u as UserRow} actions={actions} />}
        mobileKeyExtractor={(u) => (u as UserRow).user_id}
      />

      <DeleteUserDialog user={dialogs.deleteTarget} onClose={() => dialogs.setDeleteTarget(null)} />
      <RoleChangeDialog target={dialogs.roleChangeTarget} onClose={() => dialogs.setRoleChangeTarget(null)} />
      <EditNameDialog user={dialogs.editTarget} onClose={() => dialogs.setEditTarget(null)} />
      <CredentialsDialog email={dialogs.createdEmail} onClose={() => dialogs.setCreatedEmail(null)} />
      <SetPasswordDialog user={dialogs.passwordTarget} onClose={() => dialogs.setPasswordTarget(null)} />
    </>
  );
}
