import { ViewIcon, HideIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthSubmitLabel, type AuthMode } from "../lib/authTypes";
import type { FormEvent as ReactFormEvent } from "react";

export type { AuthMode };

interface Props {
  mode: AuthMode;
  email: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: (e: ReactFormEvent) => void;
}

export function AuthForm({
  mode, email, password, showPassword, loading,
  onEmailChange, onPasswordChange, onToggleShowPassword, onSubmit,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode !== "reset" && (
        <div className="space-y-1.5">
          <Label htmlFor="auth-email">Correo Electrónico</Label>
          <Input id="auth-email" type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="tu@empresa.com" required autoComplete="email" />
        </div>
      )}
      {(mode === "sign-in" || mode === "reset") && (
        <div className="space-y-1.5">
          <Label htmlFor="auth-password">{mode === "reset" ? "Nueva Contraseña" : "Contraseña"}</Label>
          <div className="relative">
            <Input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="pr-10"
              autoComplete={mode === "reset" ? "new-password" : "current-password"}
            />
            <button
              type="button"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={onToggleShowPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <HideIcon className="h-4 w-4" /> : <ViewIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading} data-testid="auth-submit">
        {getAuthSubmitLabel(loading, mode)}
      </Button>
    </form>
  );
}
