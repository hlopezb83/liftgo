import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { organizationStatusReasonSchema } from "@/lib/platformOrganizationStatus.types";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { useSetOrganizationActive } from "../hooks/usePlatformOperator";

export function OrganizationStatusAction({
  id,
  name,
  active,
  canSuspend = true,
}: {
  id: string;
  name: string;
  active: boolean;
  canSuspend?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useSetOrganizationActive();
  const { can } = usePlatformCapabilities();
  const label = active ? "Suspender" : "Reactivar";
  function close(next: boolean) {
    if (mutation.isPending) return;
    setOpen(next);
    if (!next) setReason("");
  }
  if (!can(active ? "organizations.suspend" : "organizations.resume")) return null;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={active && !canSuspend}
        title={
          active && !canSuspend
            ? "No puedes suspender la empresa a la que perteneces"
            : undefined
        }
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {label} {name}
            </DialogTitle>
            <DialogDescription>
              {active
                ? "Todos sus usuarios internos y cuentas de portal perderán el acceso. Los datos se conservan y la empresa puede reactivarse después."
                : "Sus usuarios podrán volver a entrar conforme a sus permisos y al estado de cada cuenta."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="organization-status-reason">
              Motivo del cambio
            </Label>
            <Textarea
              id="organization-status-reason"
              minLength={5}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={mutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Entre 5 y 500 caracteres. Quedará en la bitácora; no incluyas
              contraseñas ni llaves.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => close(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant={active ? "destructive" : "default"}
              disabled={
                mutation.isPending ||
                !organizationStatusReasonSchema.safeParse(reason).success
              }
              onClick={() =>
                mutation.mutate(
                  {
                    organization_id: id,
                    active: !active,
                    reason: reason.trim(),
                  },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setReason("");
                    },
                  },
                )
              }
            >
              {mutation.isPending ? "Guardando…" : `${label} empresa`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
