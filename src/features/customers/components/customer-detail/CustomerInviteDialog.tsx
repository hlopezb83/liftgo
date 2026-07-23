import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TextField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@/lib/forms/zodResolver";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerName: string;
  isPending: boolean;
  onInvite: (email: string) => void;
}

const schema = z.object({
  email: z.string().trim().email("Correo electrónico inválido"),
});
type FormValues = z.input<typeof schema>;

export function CustomerInviteDialog({ open, onOpenChange, customerName, isPending, onInvite }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  useEffect(() => { if (open) form.reset({ email: "" }); }, [open, form]);

  const onSubmit = form.handleSubmit((values) => onInvite(values.email.trim()));

  return (
    <FormDialog
      isPending={isPending}
      open={open}
      onOpenChange={onOpenChange}
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending || !form.formState.isValid}>
              {isPending ? "Enviando..." : "Enviar Invitación"}
            </Button>
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
