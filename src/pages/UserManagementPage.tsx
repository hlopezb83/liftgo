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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { UserPlus, Trash2, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CredentialsDialog } from "@/components/CredentialsDialog";
import type { AppRole } from "@/hooks/useUserRole";

const STAFF_ROLES: Exclude<AppRole, "customer">[] = ["admin", "administrativo", "dispatcher", "mechanic", "auditor"];
const ROLE_LABELS: Record<string, string> = { admin: "Admin", administrativo: "Administrativo", dispatcher: "Despachador", mechanic: "Mecánico", auditor: "Auditor" };
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-600 text-white",
  administrativo: "bg-blue-600 text-white",
  dispatcher: "bg-amber-500 text-white",
  mechanic: "bg-emerald-600 text-white",
  auditor: "bg-purple-600 text-white",
};

interface UserRow {
  user_id: string;
  full_name: string | null;
  created_at: string;
  role: AppRole;
}

function useUsersWithRoles() {
  return useQuery({
    queryKey: ["users_with_roles"],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, created_at")
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
        created_at: p.created_at,
        role: roleMap.get(p.user_id) ?? ("dispatcher" as AppRole),
      }));
    },
  });
}

function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users_with_roles"] });
      toast({ title: "Rol actualizado" });
    },
    onError: (err: Error) => {
      toast({ title: "Error al actualizar rol", description: err.message, variant: "destructive" });
    },
  });
}

function useUpdateName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, fullName }: { userId: string; fullName: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users_with_roles"] });
      toast({ title: "Nombre actualizado" });
    },
    onError: (err: Error) => {
      toast({ title: "Error al actualizar nombre", description: err.message, variant: "destructive" });
    },
  });
}

function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { email: string; full_name: string; role: string; password?: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: payload,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users_with_roles"] });
      toast({ title: "Usuario creado exitosamente" });
    },
    onError: (err: Error) => {
      toast({ title: "Error al crear usuario", description: err.message, variant: "destructive" });
    },
  });
}

function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users_with_roles"] });
      toast({ title: "Usuario eliminado" });
    },
    onError: (err: Error) => {
      toast({ title: "Error al eliminar usuario", description: err.message, variant: "destructive" });
    },
  });
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useUsersWithRoles();
  const updateRole = useUpdateRole();
  const updateName = useUpdateName();
  const inviteUser = useInviteUser();
  const deleteUser = useDeleteUser();

  // Invite dialog state
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("dispatcher");

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  // Edit name state
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const isMobile = useIsMobile();

  const handleInvite = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 6) return;
    const result = await inviteUser.mutateAsync({
      email: email.trim(),
      full_name: fullName.trim(),
      role,
      password,
    });
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

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader
          title="Gestión de Usuarios"
          subtitle="Ver y administrar roles de usuarios"
          action={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Crear Usuario
                </Button>
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
                    <Input
                      id="inv-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                    {password.length > 0 && password.length < 6 && (
                      <p className="text-sm text-destructive">La contraseña debe tener al menos 6 caracteres</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-role">Rol</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger id="inv-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r] ?? ""}`}>
                              {ROLE_LABELS[r] || r}
                            </span>
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
          }
        />

        {isLoading ? (
          <TableSkeleton />
        ) : isMobile ? (
          <div className="space-y-3">
            {users?.map((u) => (
              <Card key={u.user_id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{u.full_name ?? "—"}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditTarget(u); setEditName(u.full_name ?? ""); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {u.user_id !== currentUser?.id && (
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(u)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{new Date(u.created_at).toLocaleDateString()}</p>
                  <Select defaultValue={u.role} onValueChange={(val) => updateRole.mutate({ userId: u.user_id, role: val as AppRole })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r] ?? ""}`}>
                            {ROLE_LABELS[r] || r}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Nombre</TableHead>
                  <TableHead className="w-[20%]">Fecha de Registro</TableHead>
                  <TableHead className="w-[25%]">Rol</TableHead>
                  <TableHead className="w-[15%]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Select
                        defaultValue={u.role}
                        onValueChange={(val) =>
                          updateRole.mutate({ userId: u.user_id, role: val as AppRole })
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAFF_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[r] ?? ""}`}>
                                {ROLE_LABELS[r] || r}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditTarget(u); setEditName(u.full_name ?? ""); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {u.user_id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit name dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => { if (!v) { setEditTarget(null); setEditName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Nombre</DialogTitle>
          </DialogHeader>
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
