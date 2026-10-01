/**
 * Alta de empresa y enlace de acceso del primer administrador.
 *
 * La autorización sigue viviendo en
 * `requirePlatformOperator` y en las funciones `platform_*` de la base.
 */
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CreateOrganizationResult } from "@/lib/platformAdmin.functions";
import {
  platformOnboardingInputSchema,
  type PlatformOnboardingInput,
} from "@/lib/platformOnboarding.types";
import { useCreateOrganization } from "../hooks/usePlatformOnboarding";
import { PlatformOrganizationFormFields } from "./PlatformOrganizationFormFields";

const EMPTY_FORM = {
  name: "",
  slug: "",
  admin_email: "",
  admin_full_name: "",
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: CreateOrganizationResult) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const create = useCreateOrganization();
  const [request, setRequest] = useState<PlatformOnboardingInput | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  function close() {
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setRequest(null);
    setMessage(null);
    create.reset();
    onOpenChange(false);
  }

  const update = (field: keyof typeof EMPTY_FORM) => (value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "name" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    const snapshot = request ?? { ...form, request_id: crypto.randomUUID() };
    const valid = platformOnboardingInputSchema.safeParse(snapshot);
    if (!valid.success) {
      setMessage("Revisa nombre, identificador y correo antes de continuar.");
      return;
    }
    setRequest(snapshot);
    setMessage(null);
    try {
      const result = await create.mutateAsync(snapshot);
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      close();
      onCreated(result);
    } catch {
      setMessage(
        "No se confirmó el resultado. Reintenta con estos mismos datos o cierra y revisa las altas pendientes.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!create.isPending && !next) close();
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
            <DialogDescription>
              Se crea la empresa y después se vincula su primer administrador.
              La empresa permanece sin acceso hasta completar el alta. Si se
              interrumpe, puedes reanudarla sin volver a crear sus datos.
            </DialogDescription>
          </DialogHeader>

          {message && (
            <Alert role="status">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <PlatformOrganizationFormFields
            form={form}
            update={update}
            onSlugTouched={() => setSlugTouched(true)}
            disabled={!!request || create.isPending}
          />
          <DialogFooter>
            <Button
              type="button"
              aria-label="Cerrar formulario"
              variant="outline"
              onClick={close}
              disabled={create.isPending}
            >
              Cerrar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending
                ? "Verificando…"
                : request
                  ? "Reintentar alta"
                  : "Crear empresa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreatedResultDialog({
  result,
  onClose,
}: {
  result: CreateOrganizationResult | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!result} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empresa creada</DialogTitle>
          <DialogDescription>
            Comparte el enlace de acceso con {result?.admin_email}. Es de un
            solo uso y le permite definir su contraseña.
          </DialogDescription>
        </DialogHeader>
        {result?.recovery_link ? (
          <Input
            aria-label="Enlace de acceso del administrador"
            readOnly
            value={result.recovery_link}
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : (
          <Alert>
            <AlertTitle>Sin enlace de acceso</AlertTitle>
            <AlertDescription>
              La empresa y el administrador se crearon, pero no se pudo generar
              el enlace. El administrador puede usar "Olvidé mi contraseña" con
              su correo.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
