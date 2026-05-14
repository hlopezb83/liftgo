import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SearchBar } from "@/components/SearchBar";
import { Trash2, Pencil, KeyRound, ShieldCheck, Users } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { ListPageLayout } from "@/components/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";
import { STAFF_ROLES, ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import type { AppRole } from "@/hooks/useUserRole";

import { useUsersWithRoles, useToggleStatus, type UserRow } from "@/hooks/useUserManagement";
import { useUserManagementDialogs } from "@/hooks/users/useUserManagementDialogs";
import { useUserManagementFilters } from "@/hooks/users/useUserManagementFilters";
import { CredentialsDialog } from "@/components/users/CredentialsDialog";
import { InviteUserDialog } from "@/components/users/InviteUserDialog";
import { EditNameDialog } from "@/components/users/EditNameDialog";
import { DeleteUserDialog } from "@/components/users/DeleteUserDialog";
import { RoleChangeDialog } from "@/components/users/RoleChangeDialog";
import { SetPasswordDialog } from "@/components/users/SetPasswordDialog";

const renderRoleBadge = (r: AppRole) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r] ?? ""}`}>
    {ROLE_LABELS[r] || r}
  </span>
);

export default function UserManagementPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsersWithRoles();
  const toggleStatus = useToggleStatus();

  const dialogs = useUserManagementDialogs();
  const { search, setSearch, filterRole, setFilterRole, filtered } = useUserManagementFilters(users);
  const { page, setPage, totalPages, paginatedItems } = useListPage(filtered);

  const handleToggleStatus = (userId: string, currentActive: boolean) => {
    toggleStatus.mutate({ userId, isActive: !currentActive });
  };

  const handleRoleChange = (user: UserRow, newRole: AppRole) => {
    dialogs.setRoleChangeTarget({ user, newRole });
  };

  const renderRow = (u: UserRow) => (
    <TableRow key={u.user_id} className={!u.is_active ? "opacity-60" : ""}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {u.full_name ?? "—"}
          {u.user_id === currentUser?.id && <Badge variant="outline" className="text-[10px] px-1.5">Tú</Badge>}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{u.email ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {format(new Date(u.created_at), "dd/MM/yyyy")}
      </TableCell>
      <TableCell>
        <Select defaultValue={u.role} onValueChange={(val) => handleRoleChange(u, val as AppRole)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{renderRoleBadge(r)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {u.user_id !== currentUser?.id ? (
          <div className="flex items-center gap-2">
            <Switch checked={u.is_active} onCheckedChange={() => handleToggleStatus(u.user_id, u.is_active)} disabled={toggleStatus.isPending} />
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
          <Button variant="ghost" size="icon" title="Editar nombre" onClick={() => dialogs.setEditTarget(u)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Asignar contraseña" onClick={() => dialogs.setPasswordTarget(u)}>
            <KeyRound className="h-4 w-4" />
          </Button>
          {u.user_id !== currentUser?.id && (
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Eliminar" onClick={() => dialogs.setDeleteTarget(u)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  const mobileCard = (u: UserRow) => (
    <Card className={!u.is_active ? "opacity-60" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{u.full_name ?? "—"}</span>
            {u.user_id === currentUser?.id && <Badge variant="outline" className="text-[10px] px-1.5">Tú</Badge>}
            {!u.is_active && <Badge variant="destructive" className="text-[10px] px-1.5">Inactivo</Badge>}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => dialogs.setEditTarget(u)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => dialogs.setPasswordTarget(u)}>
              <KeyRound className="h-4 w-4" />
            </Button>
            {u.user_id !== currentUser?.id && (
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => dialogs.setDeleteTarget(u)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-1">{u.email ?? "—"}</p>
        <p className="text-xs text-muted-foreground mb-2">{format(new Date(u.created_at), "dd/MM/yyyy")}</p>
        <Select defaultValue={u.role} onValueChange={(val) => handleRoleChange(u, val as AppRole)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{renderRoleBadge(r)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {u.user_id !== currentUser?.id && (
          <div className="flex items-center gap-2 mt-3">
            <Switch checked={u.is_active} onCheckedChange={() => handleToggleStatus(u.user_id, u.is_active)} disabled={toggleStatus.isPending} />
            <span className="text-xs text-muted-foreground">{u.is_active ? "Activo" : "Inactivo"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

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
                  <SelectItem key={r} value={r}>{renderRoleBadge(r)}</SelectItem>
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
        renderRow={(u) => renderRow(u as UserRow)}
        mobileCardRender={(u) => mobileCard(u as UserRow)}
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
