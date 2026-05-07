import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** UI alternativa para errores acotados (ej. dentro de un módulo). */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Captura errores de render en el subárbol y muestra una UI minimalista
 * industrial con acciones de recuperación. Evita pantalla en blanco global.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.href = "/";
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-full bg-destructive/10 p-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              Algo salió mal
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Se produjo un error inesperado. Intenta recargar la página o volver al inicio.
            Si el problema persiste, contacta al administrador.
          </p>
          {this.state.error?.message && (
            <pre className="text-xs bg-muted p-3 rounded mb-6 overflow-auto max-h-32 text-muted-foreground font-mono">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2">
            <Button onClick={this.handleReload} className="flex-1" variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Recargar
            </Button>
            <Button onClick={this.handleGoHome} className="flex-1" variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Inicio
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
