import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** UI alternativa para errores acotados (ej. dentro de un módulo). */
  fallback?: ReactNode;
  /** "app" ocupa pantalla completa; "route" se queda dentro del shell. */
  scope?: "app" | "route";
  /** Etiqueta humana del módulo/ruta, ej. "Flota". */
  routeLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

const RELOAD_KEY = "vite-preload-reload";

function isStaleChunkMessage(msg: string): boolean {
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("ChunkLoadError")
  );
}

/**
 * Captura errores de render en el subárbol y muestra una UI minimalista
 * industrial con acciones de recuperación. Evita pantalla en blanco global.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, isChunkError: false };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      isChunkError: isStaleChunkMessage(error?.message ?? ""),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
    if (
      isStaleChunkMessage(error?.message ?? "") &&
      sessionStorage.getItem(RELOAD_KEY) !== "1"
    ) {
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    }
  }

  private handleReload = (): void => {
    sessionStorage.removeItem(RELOAD_KEY);
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.href = "/";
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const { scope = "app", routeLabel } = this.props;
    const { isChunkError, error } = this.state;

    const title = isChunkError
      ? "Hay una nueva versión disponible"
      : routeLabel
        ? `No se pudo cargar el módulo ${routeLabel}`
        : "Algo salió mal";

    const description = isChunkError
      ? "Refresca la app para cargar la última versión. Tus datos no se perderán."
      : "Se produjo un error inesperado. Intenta refrescar la app o volver al inicio. Si el problema persiste, contacta al administrador.";

    const containerCls =
      scope === "route"
        ? "min-h-[60vh] flex items-center justify-center p-6"
        : "min-h-screen flex items-center justify-center bg-background p-6";

    return (
      <div className={containerCls}>
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-full bg-destructive/10 p-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6">{description}</p>
          {error?.message && !isChunkError && (
            <details className="mb-6">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Ver detalles técnicos
              </summary>
              <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto max-h-32 text-muted-foreground font-mono whitespace-pre-wrap break-words">
                {error.message}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <Button onClick={this.handleReload} className="flex-1" variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refrescar app
            </Button>
            {scope === "app" && (
              <Button onClick={this.handleGoHome} className="flex-1" variant="outline">
                <Home className="h-4 w-4 mr-2" />
                Ir al inicio
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
