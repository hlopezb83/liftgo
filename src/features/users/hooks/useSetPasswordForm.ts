import { useState, type FormEvent as ReactFormEvent } from "react";
import { useResetPassword, type UserRow } from "./useUserManagement";

function generatePassword(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => charset[v % charset.length]).join("");
}

function validatePassword(password: string, confirm: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (password.length > 72) return "La contraseña no puede exceder 72 caracteres";
  if (password !== confirm) return "Las contraseñas no coinciden";
  return null;
}

export function useSetPasswordForm(user: UserRow | null, onClose: () => void) {
  const resetPassword = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Prev-prop guard: limpia el formulario cuando cambia el usuario objetivo.
  const [prevUserId, setPrevUserId] = useState<string | null>(null);
  const nextUserId = user?.user_id ?? null;
  if (user && prevUserId !== nextUserId) {
    setPrevUserId(nextUserId);
    setPassword("");
    setConfirm("");
    setShow(false);
    setErrorMsg(null);
  }

  const onPasswordChange = (v: string) => { setPassword(v); setErrorMsg(null); };
  const onConfirmChange = (v: string) => { setConfirm(v); setErrorMsg(null); };
  const toggleShow = () => setShow((v) => !v);

  const handleGenerate = () => {
    const pwd = generatePassword();
    setPassword(pwd);
    setConfirm(pwd);
    setShow(true);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: ReactFormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    const validationError = validatePassword(password, confirm);
    if (validationError) { setErrorMsg(validationError); return; }
    try {
      await resetPassword.mutateAsync({ userId: user.user_id, newPassword: password });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error al actualizar contraseña");
    }
  };

  return {
    password, confirm, show, errorMsg,
    isPending: resetPassword.isPending,
    onPasswordChange, onConfirmChange, toggleShow,
    handleGenerate, handleSubmit,
  };
}
