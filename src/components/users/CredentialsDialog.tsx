import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface CredentialsDialogProps {
  credentials: { email: string; password: string } | null;
  onClose: () => void;
}

export function CredentialsDialog({ credentials, onClose }: CredentialsDialogProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success("Copiado al portapapeles");
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <Dialog open={!!credentials} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Usuario Creado</DialogTitle>
          <DialogDescription>
            Comparte estas credenciales con el nuevo usuario.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Correo Electrónico</Label>
            <div className="flex gap-2">
              <Input readOnly value={credentials?.email ?? ""} />
              <Button variant="outline" size="icon" onClick={() => handleCopy(credentials?.email ?? "", "email")}>
                {copiedField === "email" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Contraseña</Label>
            <div className="flex gap-2">
              <Input readOnly value={credentials?.password ?? ""} />
              <Button variant="outline" size="icon" onClick={() => handleCopy(credentials?.password ?? "", "password")}>
                {copiedField === "password" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>La contraseña no se podrá consultar después. Asegúrate de copiarla antes de cerrar.</span>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
