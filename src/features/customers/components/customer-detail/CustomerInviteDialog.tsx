import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TextField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { usePublicBranding } from "@/features/company-settings";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { buildPortalInviteMessage } from "../../lib/portalInviteMessage";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerName: string;
  isPending: boolean;
  onInvite: (email: string) => void;
  /** Resultado de la invitación: enlace de acceso de un solo uso. */
  inviteResult?: { email: string; link: string } | null;
  onClearResult?: () => void;
}

const schema = z.object({
  email: z.string().trim().email("Correo electrónico inválido"),
});
type FormValues = z.input<typeof schema>;

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    notifySuccess(`${label} copiado`);
  } catch {
    /* el usuario puede seleccionar el texto manualmente */
  }
}

export function CustomerInviteDialog({
  open,
  onOpenChange,
  customerName,
  isPending,
  onInvite,
  inviteResult,
  onClearResult,
}: Props) {
  const { data: branding } = usePublicBranding();
  const empresa = branding?.razon_social ?? "LiftGo";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  useEffect(() => { if (open) form.reset({ email: "" }); }, [open, form]);

  const onSubmit = form.handleSubmit((values) => onInvite(values.email.trim()));

  const handleOpenChange = (v: boolean) => {
    if (!v) onClearResult?.();
    onOpenChange(v);
  };

  if (inviteResult) {
    const mensaje = buildPortalInviteMessage({
      empresa,
      clienteNombre: customerName,
      link: inviteResult.link,
    });
    return (
      <FormDialog
        isPending={false}
        open={open}
        onOpenChange={handleOpenChange}
        title="Acceso al portal creado"
        description={`Comparte estos datos con ${inviteResult.email}. El enlace es de un solo uso.`}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Mensaje de invitación</p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs text-muted-foreground">
              {mensaje}
            </pre>
          </div>
          <p className="break-all rounded-md border bg-muted p-3 text-xs text-muted-foreground">
            {inviteResult.link}
          </p>
          <FormDialogFooter>
            <Button variant="outline" type="button" onClick={() => void copy(inviteResult.link, "Enlace")}>
              Copiar enlace
            </Button>
            <Button type="button" onClick={() => void copy(mensaje, "Mensaje")}>
              Copiar mensaje
            </Button>
          </FormDialogFooter>
        </div>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      isPending={isPending}
      open={open}
      onOpenChange={handleOpenChange}
      title="Invitar al Portal de Clientes"
      description={`Crear una cuenta de portal para ${customerName}.`}
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-3">
          <TextField
            control={form.control}
            name="email"
            label="Correo Electrónico"
            type="email"
            required
            placeholder="cliente@ejemplo.com"
          />
          <FormDialogFooter>
            <FormDialogCancelButton onCancel={() => handleOpenChange(false)} disabled={isPending} />
            <Button type="submit" disabled={isPending || !form.formState.isValid}>
              {isPending ? "Enviando…" : "Crear acceso"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
