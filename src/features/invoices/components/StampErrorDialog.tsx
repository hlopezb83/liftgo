import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FacturapiErrorKind } from "../lib/facturapiErrors";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
  kind: FacturapiErrorKind;
  customerId?: string | null;
}

interface KindCopy {
  title: string;
  hint?: string;
  cta?: { label: string; to: string };
}

function getCopy(kind: FacturapiErrorKind, customerId?: string | null): KindCopy {
  switch (kind) {
    case "receptor_data":
      return {
        title: "Datos fiscales del receptor incorrectos",
        hint:
          "Revisa contra la Constancia de Situación Fiscal (CSF) del cliente: RFC, razón social, régimen fiscal y código postal del domicilio fiscal.",
        cta: customerId
          ? { label: "Editar cliente", to: `/customers/${customerId}` }
          : undefined,
      };
    case "csd":
      return {
        title: "Certificado de sello digital vencido",
        hint: "Renueva el CSD ante el SAT y vuelve a cargarlo en Datos Fiscales → PAC.",
        cta: { label: "Ir a Datos Fiscales", to: "/company-settings" },
      };
    case "credits":
      return {
        title: "Sin folios disponibles",
        hint: "Recarga tu plan de timbres en Facturapi e intenta de nuevo.",
        cta: { label: "Ir a Datos Fiscales", to: "/company-settings" },
      };
    case "auth":
      return {
        title: "API key de Facturapi inválida",
        hint: "Verifica la API key configurada para el modo actual (test/live).",
        cta: { label: "Ir a Datos Fiscales", to: "/company-settings" },
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

export function StampErrorDialog({ open, onOpenChange, message, kind, customerId }: Props) {
  const navigate = useNavigate();
  const copy = getCopy(kind, customerId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            {copy.title}
          </DialogTitle>
          <DialogDescription className="pt-2">{message}</DialogDescription>
        </DialogHeader>
        {copy.hint && (
          <p className="text-sm text-muted-foreground">{copy.hint}</p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {copy.cta && (
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate(copy.cta!.to);
              }}
            >
              {copy.cta.label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
