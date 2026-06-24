import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateName, type UserRow } from "../../hooks/useUserManagement";
import { useState, useEffect } from "react";

interface EditNameDialogProps {
  user: UserRow | null;
  onClose: () => void;
}

export function EditNameDialog({ user, onClose }: EditNameDialogProps) {
  const [name, setName] = useState("");
  const updateName = useUpdateName();

  useEffect(() => {
    if (user) setName(user.full_name ?? "");
  }, [user]);

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    await updateName.mutateAsync({ userId: user.user_id, fullName: name.trim() });
    onClose();
  };

  return (
    <FormDialog open={!!user} onOpenChange={(v) => { if (!v) onClose(); }} title="Editar Nombre">
        <div className="space-y-2 py-2">
          <Label htmlFor="edit-name">Nombre Completo</Label>
          <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={updateName.isPending || !name.trim()}>
            {updateName.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
