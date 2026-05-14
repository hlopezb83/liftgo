import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

interface CredentialsDialogProps {
  email: string | null;
  onClose: () => void;
}

export function CredentialsDialog({ email, onClose }: CredentialsDialogProps) {
  return (
    <Dialog open={!!email} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Usuario Creado</DialogTitle>
          <DialogDescription>
            La cuenta ha sido creada exitosamente.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-md border p-4 text-sm">
          <Mail className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">{email}</p>
            <p className="text-muted-foreground mt-1">
              El usuario recibirá instrucciones de acceso por correo electrónico.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
