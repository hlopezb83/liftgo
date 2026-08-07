import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Props {
  customerId: string;
  customerName?: string | null;
}

/**
 * Aviso cuando el cliente del contrato no tiene "Representante Legal" capturado.
 * Sin ese dato, el contrato y el pagaré imprimen la línea en blanco: nunca se
 * sustituye con la persona de contacto ni con los testigos.
 */
export function MissingLegalRepAlert({ customerId, customerName }: Props) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Falta el Representante Legal</AlertTitle>
      <AlertDescription>
        {customerName ? `${customerName} no tiene` : "El cliente no tiene"} capturado su
        representante legal. El contrato y el pagaré saldrán con la línea en blanco.{" "}
        <Link to={`/customers/${customerId}`} className="underline font-medium">
          Capturarlo en la ficha del cliente
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}
