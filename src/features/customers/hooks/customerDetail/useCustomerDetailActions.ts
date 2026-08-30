import { useState } from "react";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { useUpdateCustomer, useDeleteCustomer } from "../customers/useCustomers";
import { useInviteCustomer } from "../customers/useInviteCustomer";
import type { CustomerFormData } from "../../lib/customerFormSchema";

const OPTIONAL_NULL_FIELDS = [
  "email", "phone", "address", "notes", "website", "contact_person",
  "rfc", "regimen_fiscal", "uso_cfdi", "domicilio_fiscal_cp", "representante_legal",
] as const;

function customerFormToUpdate(form: CustomerFormData) {
  // R7 Bloque 9: `razon_social` alimenta CFDI 4.0 y PDFs; sincronizamos con
  // `name`/`company` (misma regla que `buildCustomerPayload` en create) para
  // que un rename desde detalle no deje la razón social obsoleta.
  const base: Record<string, string | null> = {
    name: form.name,
    company: form.name,
    razon_social: form.name,
  };
  for (const k of OPTIONAL_NULL_FIELDS) {
    const v = form[k as keyof CustomerFormData];
    base[k] = (typeof v === "string" ? v : "") || null;
  }
  return base;
}

interface Params {
  id: string | undefined;
  /** M-11a: `version` del cliente tal como se cargó (bloqueo optimista). */
  expectedVersion?: number | null;
  setInviteOpen: (open: boolean) => void;
  setEditOpen: (open: boolean) => void;
}

export function useCustomerDetailActions({ id, expectedVersion, setInviteOpen, setEditOpen }: Params) {
  const navigate = useNavigateTransition();
  const updateCustomer = useUpdateCustomer();
  // Carrera: la BD es la autoridad. Si el saldo cambió entre el render y el
  // clic, el rechazo del backend se muestra como bloqueo explicable.
  const [archiveBlock, setArchiveBlock] = useState<BusinessBlock | null>(null);
  const deleteCustomer = useDeleteCustomer({ onBusinessBlock: setArchiveBlock });
  const inviteCustomer = useInviteCustomer();

  const handleInvite = (email: string) => {
    if (!email || !id) return;
    inviteCustomer.mutate(
      { customerId: id, email },
      { onSuccess: () => setInviteOpen(false) },
    );
  };

  const handleEditSubmit = (form: CustomerFormData) => {
    if (!id) return;
    updateCustomer.mutate({ id, expectedVersion, ...customerFormToUpdate(form) }, {
      onSuccess: () => { notifySuccess("Cliente actualizado"); setEditOpen(false); },
    });
  };

  // R8 Bloque 6·#16: pre-verificación en cliente. Si el cliente tiene rentas
  // activas (confirmed/active), no invocamos el RPC — el mensaje coincide con
  // el que devolvería la BD pero evita el round-trip y un toast de error genérico.
  const handleDelete = (activeBookingsCount = 0) => {
    if (!id) return;
    if (activeBookingsCount > 0) {
      notifyValidation({
        message: `El cliente tiene ${activeBookingsCount} renta(s) activa(s). Cancélalas o complétalas antes de archivar.`,
      });
      return;
    }
    setArchiveBlock(null);
    deleteCustomer.mutate(id, {
      onSuccess: () => { notifySuccess("Cliente archivado"); navigate("/customers"); },
    });
  };

  return {
    inviteCustomer, updateCustomer, deleteCustomer,
    handleInvite, handleEditSubmit, handleDelete,
    archiveBlock, setArchiveBlock,
    navigate,
  };
}
