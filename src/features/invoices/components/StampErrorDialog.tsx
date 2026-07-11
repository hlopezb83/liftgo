import { useNavigate } from "react-router-dom";
import { InfoAlertIcon, DuplicateIcon } from "@/components/icons";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { notifySuccess } from "@/lib/ui/appFeedback";
import type { FacturapiErrorKind } from "../lib/facturapiErrors";

interface ReceptorSnapshot {
  rfc: string | null;
  razonSocial: string | null;
  cp: string | null;
  regimenFiscal: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
  kind: FacturapiErrorKind;
  customerId?: string | null;
  receptor?: ReceptorSnapshot;
}

interface KindCopy {
  title: string;
  hint?: string;
  cta?: { label: string; to: string };
}

function getCopy(kind: FacturapiErrorKind, customerId?: string | null, message?: string): KindCopy {
  switch (kind) {
    case "receptor_data": {
      const specific = message ? /código postal|razón social/i.test(message) : false;
      return {
        title: "Datos fiscales del receptor incorrectos",
        hint: specific
          ? undefined
          : "Pide al cliente su CSF actualizada y verifica RFC, razón social, régimen fiscal y código postal. Un solo carácter diferente provoca este rechazo.",
        cta: customerId
          ? { label: "Editar cliente", to: `/customers/${customerId}` }
          : undefined,
      };
    }
    case "csd":
      return {
        title: "Certificado de sello digital vencido",
        hint: "Renueva el CSD ante el SAT y vuelve a cargarlo en Datos Fiscales → PAC.",
        cta: { label: "Ir a Datos Fiscales", to: "/settings/company" },
      };
    case "credits":
      return {
        title: "Sin folios disponibles",
        hint: "Recarga tu plan de timbres en Facturapi e intenta de nuevo.",
        cta: { label: "Ir a Datos Fiscales", to: "/settings/company" },
      };
    case "auth":
      return {
        title: "API key de Facturapi inválida",
        hint: "Verifica la API key configurada para el modo actual (test/live).",
        cta: { label: "Ir a Datos Fiscales", to: "/settings/company" },
      };
    case "folio":
      return {
        title: "Folio duplicado",
        hint: "El folio ya fue usado. Genera un nuevo número de factura.",
      };
    default:
      return { title: "Error al timbrar" };
  }
}

interface FieldRowProps {
  label: string;
  value: string | null;
  mono?: boolean;
}

function FieldRow({ label, value, mono }: FieldRowProps) {
  const display = value && value.trim() !== "" ? value : "—";
  const canCopy = !!value && value.trim() !== "";
  const handleCopy = async () => {
    if (!canCopy || !value) return;
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess(`${label} copiado`);
    } catch {
      // silent
    }
  };
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b last:border-b-0 border-border/50">
      <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-sm text-right break-all ${mono ? "font-mono" : ""}`}>{display}</span>
        {canCopy && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleCopy}
            aria-label={`Copiar ${label}`}
          >
            <DuplicateIcon className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function StampErrorDialog({ open, onOpenChange, message, kind, customerId, receptor }: Props) {
  const navigate = useNavigate();
  const copy = getCopy(kind, customerId, message);
  const showReceptor = kind === "receptor_data" && !!receptor;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={copy.title}
      description={
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-destructive">
            <InfoAlertIcon className="h-4 w-4" /> Error al timbrar
          </span>
          <span>{message}</span>
        </span>
      }
    >
      <div className="space-y-3">
        {copy.hint && <p className="text-sm text-muted-foreground">{copy.hint}</p>}
        {showReceptor && receptor && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Datos enviados al SAT
              </p>
              <FieldRow label="RFC" value={receptor.rfc} mono />
              <FieldRow label="Razón social" value={receptor.razonSocial} />
              <FieldRow label="Régimen fiscal" value={receptor.regimenFiscal} mono />
              <FieldRow label="Código postal" value={receptor.cp} mono />
            </div>
            <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
              <li>Pide la <strong>CSF vigente</strong> del cliente (no una copia vieja).</li>
              <li>
                Compara <strong>RFC, razón social y CP</strong> carácter por carácter — un
                acento, espacio o coma sobra/falta y el SAT rechaza.
              </li>
              <li>Si difiere, actualiza el cliente y <strong>vuelve a timbrar</strong> desde esta misma factura.</li>
            </ol>
          </div>
        )}
      </div>
      <FormDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        {copy.cta && (
          <Button
            onClick={() => {
              const target = copy.cta?.to;
              onOpenChange(false);
              if (target) navigate(target);
            }}
          >
            {copy.cta.label}
          </Button>
        )}
      </FormDialogFooter>
    </FormDialog>
  );
}
