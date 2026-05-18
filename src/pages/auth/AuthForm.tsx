import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthSubmitLabel, type AuthMode } from "./authTypes";

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
  onSubmit: (e: React.FormEvent) => void;
}

export function AuthForm({
  mode, email, password, showPassword, loading,
  onEmailChange, onPasswordChange, onToggleShowPassword, onSubmit,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode !== "reset" && (
        <div className="space-y-1.5">
          <Label>Correo Electrónico</Label>
          <Input type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="tu@empresa.com" required />
        </div>
      )}
      {(mode === "sign-in" || mode === "reset") && (
        <div className="space-y-1.5">
          <Label>{mode === "reset" ? "Nueva Contraseña" : "Contraseña"}</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="pr-10"
            />
            <button
              type="button"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={onToggleShowPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {getAuthSubmitLabel(loading, mode)}
      </Button>
    </form>
  );
}
