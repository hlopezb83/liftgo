import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Mail } from "@/components/icons";

interface CredentialsDialogProps {
  email: string | null;
  onClose: () => void;
}

export function CredentialsDialog({ email, onClose }: CredentialsDialogProps) {
  return (
    <FormDialog
      open={!!email}
      onOpenChange={(v) => !v && onClose()}
      title="Usuario Creado"
      description="La cuenta ha sido creada exitosamente."
    >
      <div className="flex items-start gap-3 rounded-md border p-4 text-sm">
        <Mail className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
        <div>
          <p className="font-medium">{email}</p>
          <p className="text-muted-foreground mt-1">
            El usuario recibirá instrucciones de acceso por correo electrónico.
          </p>
        </div>
      </div>
      <FormDialogFooter>
        <Button onClick={onClose}>Cerrar</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
