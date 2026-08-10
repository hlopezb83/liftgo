import { useState } from "react";
import { useResetPassword, type UserRow } from "./useUserManagement";

export function useSetPasswordForm(user: UserRow | null, onClose: () => void) {
  const resetPassword = useResetPassword();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGenerateLink = async () => {
    if (!user) return;
    setErrorMsg(null);
    try {
      await resetPassword.mutateAsync({ userId: user.user_id });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al generar enlace de recuperación");
    }
  };

  return {
    errorMsg,
    isPending: resetPassword.isPending,
    handleGenerateLink,
  };
}
