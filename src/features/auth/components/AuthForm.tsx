import { useId, type FormEvent as ReactFormEvent, type Ref } from "react";
import { PasswordVisibilityToggle } from "@/components/forms/PasswordVisibilityToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthSubmitLabel, type AuthMode } from "../lib/authTypes";

export type { AuthMode };

const MIN_PASSWORD_LENGTH = 6;

interface Props {
  mode: AuthMode;
  email: string;
  emailRef?: Ref<HTMLInputElement>;
  password: string;
  showPassword: boolean;
  loading: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: (e: ReactFormEvent) => void;
}

export function AuthForm({
  mode, email, emailRef, password, showPassword, loading,
  onEmailChange, onPasswordChange, onToggleShowPassword, onSubmit,
}: Props) {
  const passwordHelpId = useId();
  const isReset = mode === "reset";
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode !== "reset" && (
        <div className="space-y-1.5">
          <Label htmlFor="auth-email">Correo Electrónico</Label>
          <Input ref={emailRef} id="auth-email" type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="tu@empresa.com" required autoComplete="email" className="touch:h-11" />
        </div>
      )}
      {(mode === "sign-in" || mode === "reset") && (
        <div className="space-y-1.5">
          <Label htmlFor="auth-password">{mode === "reset" ? "Nueva contraseña" : "Contraseña"}</Label>
          <div className="relative">
            <Input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="••••••••"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby={isReset ? passwordHelpId : undefined}
              className="pr-10 touch:h-11"
              autoComplete={mode === "reset" ? "new-password" : "current-password"}
            />
            <PasswordVisibilityToggle visible={showPassword} onToggle={onToggleShowPassword} />
          </div>
          {isReset && <p id={passwordHelpId} className="text-xs text-muted-foreground">Usa al menos {MIN_PASSWORD_LENGTH} caracteres.</p>}
        </div>
      )}
      <Button type="submit" className="w-full touch:h-11" disabled={loading} data-testid="auth-submit">
        {getAuthSubmitLabel(loading, mode)}
      </Button>
    </form>
  );
}
