import { useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { FormSection } from "@/components/forms/FormSection";
import { WarnIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CustomerSelector, type Customer } from "@/features/customers";
import type { Tables } from "@/integrations/supabase/types";
import { ConvertQuoteSummary } from "./ConvertQuoteSummary";

export interface ConvertQuoteConfirmPayload {
  recurring: boolean;
  customerId: string;
  customerName: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Tables<"quotes">;
  durationDays: number;
  unitCount: number;
  /** Cuando la cotización está a nombre de "Público en General" hay que reasignar. */
  needsCustomer: boolean;
  customers: Customer[];
  /** Si `true`, después de confirmar todavía falta elegir los montacargas. */
  needsAssignment: boolean;
  isPending: boolean;
  onConfirm: (payload: ConvertQuoteConfirmPayload) => void;
}

/**
 * Paso único de confirmación antes de convertir una cotización en reserva(s).
 *
 * Antes el flujo encadenaba hasta tres modales sin contexto (reasignar cliente →
 * recurrencia → asignación) y en el caso legacy convertía en silencio. Aquí se
 * muestra el resumen, se resuelve el cliente final y se decide la facturación
 * recurrente en una sola pantalla.
 */
export function ConvertQuoteDialog({
  open, onOpenChange, quote, durationDays, unitCount, needsCustomer,
  customers, needsAssignment, isPending, onConfirm,
}: Props) {
  const [recurring, setRecurring] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");

  const canRecur = durationDays >= 30;
  const blocked = needsCustomer && !customerId;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      isPending={isPending}
      testId="convert-quote-dialog"
      title="Convertir a reserva"
      description="Revisa los datos antes de generar las reservas. Esta acción bloquea los equipos en el calendario."
    >
      <div className="space-y-4">
        <FormSection title="Resumen" first>
          <ConvertQuoteSummary quote={quote} durationDays={durationDays} unitCount={unitCount} />
        </FormSection>

        {needsCustomer && (
          <FormSection title="Cliente final">
            <Alert>
              <WarnIcon className="h-4 w-4" />
              <AlertDescription>
                La cotización está a nombre de “Público en General”. Selecciona el cliente real
                para poder facturar la reserva.
              </AlertDescription>
            </Alert>
            <CustomerSelector
              customers={customers}
              customerId={customerId}
              customerName={customerName}
              onCustomerIdChange={setCustomerId}
              onCustomerNameChange={setCustomerName}
              required
              hideManualName
            />
          </FormSection>
        )}

        {canRecur && (
          <FormSection title="Facturación">
            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="convert-recurring" className="text-sm">Facturación recurrente mensual</Label>
                <p className="text-xs text-muted-foreground">
                  Genera automáticamente una factura por cada mes calendario del periodo rentado.
                  Puedes desactivarla después desde la reserva.
                </p>
              </div>
              <Switch
                id="convert-recurring"
                checked={recurring}
                onCheckedChange={setRecurring}
                disabled={isPending}
              />
            </div>
          </FormSection>
        )}

        <FormDialogFooter>
          <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={isPending} />
          <Button
            type="button"
            disabled={blocked || isPending}
            data-testid="convert-quote-confirm"
            onClick={() => onConfirm({ recurring, customerId, customerName })}
          >
            {isPending
              ? "Creando reservas…"
              : needsAssignment
                ? "Continuar: asignar equipos"
                : `Crear ${unitCount} reserva(s)`}
          </Button>
        </FormDialogFooter>
      </div>
    </FormDialog>
  );
}
