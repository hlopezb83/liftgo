import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/PageTransition";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";

const STAFF_ROLES: Exclude<AppRole, "customer">[] = ["admin", "dispatcher", "mechanic"];

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
      toast({ title: "Role updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    },
  });
}

function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { email: string; full_name: string; role: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: payload,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users_with_roles"] });
      toast({ title: "User invited successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to invite user", description: err.message, variant: "destructive" });
    },
  });
}

const roleBadgeVariant = (role: AppRole) => {
  if (role === "admin") return "default";
  if (role === "dispatcher") return "secondary";
  return "outline";
};

export default function UserManagementPage() {
  const { data: users, isLoading } = useUsersWithRoles();
  const updateRole = useUpdateRole();
  const inviteUser = useInviteUser();

  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("dispatcher");

  const handleInvite = async () => {
    if (!fullName.trim() || !email.trim()) return;
    await inviteUser.mutateAsync({ email: email.trim(), full_name: fullName.trim(), role });
    setOpen(false);
    setFullName("");
    setEmail("");
    setRole("dispatcher");
  };

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader
          title="User Management"
          subtitle="View and manage user roles"
          action={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite New User</DialogTitle>
                  <DialogDescription>Create a new staff account. They will be able to log in immediately.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="inv-name">Full Name</Label>
                    <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-email">Email</Label>
                    <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-role">Role</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger id="inv-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            <span className="capitalize">{r}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={handleInvite} disabled={inviteUser.isPending || !fullName.trim() || !email.trim()}>
                    {inviteUser.isPending ? "Inviting…" : "Invite"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        {isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Role</TableHead>
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
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAFF_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
                                r === "admin" ? "border-transparent bg-primary text-primary-foreground" :
                                r === "dispatcher" ? "border-transparent bg-secondary text-secondary-foreground" :
                                "text-foreground"
                              }`}>
                                {r}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
