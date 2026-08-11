import { useState } from "react";
import { useResetPassword, type UserRow } from "./useUserManagement";

export function useSetPasswordForm(user: UserRow | null, onClose: () => void) {
  const resetPassword = useResetPassword();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // El enlace es de un solo uso: se conserva en el diálogo para que el admin
  // pueda copiarlo con calma (el toast se descarta solo).
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);

  const handleGenerateLink = async () => {
    if (!user) return;
    setErrorMsg(null);
    try {
      const data = await resetPassword.mutateAsync({ userId: user.user_id });
      setRecoveryLink(data.recovery_link);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al generar enlace de recuperación");
    }
  };

  const handleClose = () => {
    setRecoveryLink(null);
    setErrorMsg(null);
    onClose();
  };

  return {
    errorMsg,
    recoveryLink,
    isPending: resetPassword.isPending,
    handleGenerateLink,
    handleClose,
  };
}
