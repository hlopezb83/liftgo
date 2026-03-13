import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/PageTransition";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { MobileCardList } from "@/components/MobileCardList";
import { SearchBar } from "@/components/SearchBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { UserPlus, Trash2, Pencil, KeyRound, ShieldCheck } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { CredentialsDialog } from "@/components/users/CredentialsDialog";
import { useNavigate } from "react-router-dom";
import { TablePagination } from "@/components/TablePagination";
import type { AppRole } from "@/hooks/useUserRole";
import { STAFF_ROLES, ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";

const PAGE_SIZE = 10;

interface UserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  role: AppRole;
  is_active: boolean;
}

// ─── Hooks ───────────────────────────────────────────────
function useUsersWithRoles() {
  return useQuery({
    queryKey: ["users_with_roles"],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, is_active, created_at")
        .order("created_at", { ascending: false });
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      const roleMap = new Map(roles.map((r) => [r.user_id, r.role as AppRole]));
      return (profiles ?? []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: (p as any).email ?? null,
        created_at: p.created_at,
        role: roleMap.get(p.user_id) ?? ("dispatcher" as AppRole),
        is_active: (p as any).is_active ?? true,
      })) as UserRow[];
    },
  });
}

function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").update({ role }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users_with_roles"] });
      toast.success("Rol actualizado");
    },
    onError: (err: Error) => toast.error("Error al actualizar rol", { description: err.message }),
  });
}

function useUpdateName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, fullName }: { userId: string; fullName: string }) => {
      const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users_with_roles"] });
      toast({ title: "Nombre actualizado" });
    },
    onError: (err: Error) => toast({ title: "Error al actualizar nombre", description: err.message, variant: "destructive" }),
  });
}

function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { email: string; full_name: string; role: string; password?: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-user", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users_with_roles"] });
      toast({ title: "Usuario creado exitosamente" });
    },
    onError: (err: Error) => toast({ title: "Error al crear usuario", description: err.message, variant: "destructive" }),
  });
}

function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", { body: { user_id: userId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users_with_roles"] });
      toast({ title: "Usuario eliminado" });
    },
    onError: (err: Error) => toast({ title: "Error al eliminar usuario", description: err.message, variant: "destructive" }),
  });
}

function useResetPassword() {
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("reset-user-password", { body: { user_id: userId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { email: string; password: string };
    },
    onError: (err: Error) => toast({ title: "Error al resetear contraseña", description: err.message, variant: "destructive" }),
  });
}

function useToggleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { data, error } = await supabase.functions.invoke("toggle-user-status", { body: { user_id: userId, is_active: isActive } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["users_with_roles"] });
      toast({ title: vars.isActive ? "Usuario activado" : "Usuario desactivado" });
    },
    onError: (err: Error) => toast({ title: "Error al cambiar estado", description: err.message, variant: "destructive" }),
  });
}

// ─── Page ────────────────────────────────────────────────
export default function UserManagementPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsersWithRoles();
  const updateRole = useUpdateRole();
  const updateName = useUpdateName();
  const inviteUser = useInviteUser();
  const deleteUser = useDeleteUser();
  const resetPassword = useResetPassword();
  const toggleStatus = useToggleStatus();

  // Invite dialog
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("dispatcher");

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  // Edit name dialog
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  // Credentials dialog
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  // Role change confirmation
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ user: UserRow; newRole: AppRole } | null>(null);

  // Search & filter
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [page, setPage] = useState(1);

  const isMobile = useIsMobile();

  // Filter users
  const filtered = (users ?? []).filter((u) => {
    const matchesSearch = !search || 
      (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesRole = filterRole === "all" || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleInvite = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 6) return;
    const result = await inviteUser.mutateAsync({ email: email.trim(), full_name: fullName.trim(), role, password });
    setOpen(false);
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("dispatcher");
    setCreatedCredentials({ email: result.email, password: result.password });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteUser.mutateAsync(deleteTarget.user_id);
    setDeleteTarget(null);
  };

  const handleEditName = async () => {
    if (!editTarget || !editName.trim()) return;
    await updateName.mutateAsync({ userId: editTarget.user_id, fullName: editName.trim() });
    setEditTarget(null);
    setEditName("");
  };

  const handleRoleChange = (user: UserRow, newRole: AppRole) => {
    setRoleChangeTarget({ user, newRole });
  };

  const confirmRoleChange = async () => {
    if (!roleChangeTarget) return;
    await updateRole.mutateAsync({ userId: roleChangeTarget.user.user_id, role: roleChangeTarget.newRole });
    setRoleChangeTarget(null);
  };

  const handleResetPassword = async (userId: string) => {
    const result = await resetPassword.mutateAsync(userId);
    setCreatedCredentials({ email: result.email, password: result.password });
  };

  const handleToggleStatus = (userId: string, currentActive: boolean) => {
    toggleStatus.mutate({ userId, isActive: !currentActive });
  };

  const renderRoleBadge = (r: AppRole) => (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r] ?? ""}`}>
      {ROLE_LABELS[r] || r}
    </span>
  );

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
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><UserPlus className="mr-2 h-4 w-4" />Crear Usuario</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                  <DialogDescription>Crea una nueva cuenta de personal. Podrá iniciar sesión de inmediato.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="inv-name">Nombre Completo</Label>
                    <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Pérez" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-email">Correo Electrónico</Label>
                    <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-password">Contraseña</Label>
                    <Input id="inv-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                    {password.length > 0 && password.length < 6 && (
                      <p className="text-sm text-destructive">La contraseña debe tener al menos 6 caracteres</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-role">Rol</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger id="inv-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAFF_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {renderRoleBadge(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={handleInvite} disabled={inviteUser.isPending || !fullName.trim() || !email.trim() || password.length < 6}>
                    {inviteUser.isPending ? "Creando…" : "Crear Usuario"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
          }
        />

        {/* Search & Filters */}
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
                      <Button variant="ghost" size="icon" onClick={() => { setEditTarget(u); setEditName(u.full_name ?? ""); }}>
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
                      <div>
                        {format(new Date(u.created_at), "dd/MM/yyyy")}
                      </div>
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
                        <Button variant="ghost" size="icon" title="Editar nombre" onClick={() => { setEditTarget(u); setEditName(u.full_name ?? ""); }}>
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente a <strong>{deleteTarget?.full_name ?? "este usuario"}</strong> y su cuenta de acceso. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleteUser.isPending}>
              {deleteUser.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Role change confirmation */}
      <AlertDialog open={!!roleChangeTarget} onOpenChange={(v) => !v && setRoleChangeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cambiará el rol de <strong>{roleChangeTarget?.user.full_name ?? "este usuario"}</strong> de{" "}
              {renderRoleBadge(roleChangeTarget?.user.role ?? "dispatcher")} a {renderRoleBadge(roleChangeTarget?.newRole ?? "dispatcher")}.
              Esto modificará los permisos de acceso del usuario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRoleChange} disabled={updateRole.isPending}>
              {updateRole.isPending ? "Actualizando…" : "Confirmar Cambio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit name dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => { if (!v) { setEditTarget(null); setEditName(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Nombre</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="edit-name">Nombre Completo</Label>
            <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditName(""); }}>Cancelar</Button>
            <Button onClick={handleEditName} disabled={updateName.isPending || !editName.trim()}>
              {updateName.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CredentialsDialog credentials={createdCredentials} onClose={() => setCreatedCredentials(null)} />
    </PageTransition>
  );
}
