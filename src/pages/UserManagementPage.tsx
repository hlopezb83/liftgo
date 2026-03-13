import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MobileCardList } from "@/components/MobileCardList";
import { SearchBar } from "@/components/SearchBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Trash2, Pencil, KeyRound, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { TablePagination } from "@/components/TablePagination";
import { STAFF_ROLES, ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import type { AppRole } from "@/hooks/useUserRole";

import { useUsersWithRoles, useResetPassword, useToggleStatus, type UserRow } from "@/hooks/useUserManagement";
import { CredentialsDialog } from "@/components/users/CredentialsDialog";
import { InviteUserDialog } from "@/components/users/InviteUserDialog";
import { EditNameDialog } from "@/components/users/EditNameDialog";
import { DeleteUserDialog } from "@/components/users/DeleteUserDialog";
import { RoleChangeDialog } from "@/components/users/RoleChangeDialog";

const PAGE_SIZE = 10;

const renderRoleBadge = (r: AppRole) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r] ?? ""}`}>
    {ROLE_LABELS[r] || r}
  </span>
);

export default function UserManagementPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsersWithRoles();
  const resetPassword = useResetPassword();
  const toggleStatus = useToggleStatus();

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ user: UserRow; newRole: AppRole } | null>(null);

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [page, setPage] = useState(1);
  const isMobile = useIsMobile();

  const filtered = (users ?? []).filter((u) => {
    const matchesSearch = !search ||
      (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesRole = filterRole === "all" || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleResetPassword = async (userId: string) => {
    const result = await resetPassword.mutateAsync(userId);
    setCreatedCredentials({ email: result.email, password: result.password });
  };

  const handleToggleStatus = (userId: string, currentActive: boolean) => {
    toggleStatus.mutate({ userId, isActive: !currentActive });
  };

  const handleRoleChange = (user: UserRow, newRole: AppRole) => {
    setRoleChangeTarget({ user, newRole });
  };

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader
          title="Gestión de Usuarios"
          subtitle="Ver y administrar roles de usuarios"
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/users/permissions")}>
                <ShieldCheck className="mr-2 h-4 w-4" />Ver permisos
              </Button>
              <InviteUserDialog onCreated={setCreatedCredentials} />
            </div>
          }
        />

        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar por nombre o email…" className="flex-1 max-w-md" />
          <Select value={filterRole} onValueChange={(v) => { setFilterRole(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar por rol" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              {STAFF_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{renderRoleBadge(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <TableSkeleton columnCount={6} />
        ) : isMobile ? (
          <MobileCardList
            items={paginated}
            keyExtractor={(u) => u.user_id}
            emptyMessage="No hay usuarios"
            renderCard={(u) => (
              <Card className={!u.is_active ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{u.full_name ?? "—"}</span>
                      {u.user_id === currentUser?.id && <Badge variant="outline" className="text-[10px] px-1.5">Tú</Badge>}
                      {!u.is_active && <Badge variant="destructive" className="text-[10px] px-1.5">Inactivo</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditTarget(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleResetPassword(u.user_id)} disabled={resetPassword.isPending}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      {u.user_id !== currentUser?.id && (
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(u)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{u.email ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mb-2">{format(new Date(u.created_at), "dd/MM/yyyy")}</p>
                  <div className="flex items-center justify-between">
                    <Select defaultValue={u.role} onValueChange={(val) => handleRoleChange(u, val as AppRole)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAFF_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{renderRoleBadge(r)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {u.user_id !== currentUser?.id && (
                    <div className="flex items-center gap-2 mt-3">
                      <Switch checked={u.is_active} onCheckedChange={() => handleToggleStatus(u.user_id, u.is_active)} disabled={toggleStatus.isPending} />
                      <span className="text-xs text-muted-foreground">{u.is_active ? "Activo" : "Inactivo"}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Fecha de Registro</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((u) => (
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
                      <div className="flex items-center gap-1">
                        <Select defaultValue={u.role} onValueChange={(val) => handleRoleChange(u, val as AppRole)}>
                          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STAFF_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {renderRoleBadge(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
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
                        <Button variant="ghost" size="icon" title="Editar nombre" onClick={() => setEditTarget(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Resetear contraseña" onClick={() => handleResetPassword(u.user_id)} disabled={resetPassword.isPending}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {u.user_id !== currentUser?.id && (
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Eliminar" onClick={() => setDeleteTarget(u)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {totalPages > 1 && (
          <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>

      <DeleteUserDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <RoleChangeDialog target={roleChangeTarget} onClose={() => setRoleChangeTarget(null)} />
      <EditNameDialog user={editTarget} onClose={() => setEditTarget(null)} />
      <CredentialsDialog credentials={createdCredentials} onClose={() => setCreatedCredentials(null)} />
    </PageTransition>
  );
}
