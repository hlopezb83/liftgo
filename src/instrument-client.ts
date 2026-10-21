import { initClientSentry } from "./lib/observability/sentry";

// Importar primero desde client.ts y conservar este efecto en package.sideEffects.
initClientSentry();

// Public, non-secret source identity compiled into this bundle, not fetched.
Object.defineProperty(globalThis, "__LIFTGO_SOURCE_ID__", {
  value: import.meta.env.VITE_APP_SOURCE_ID, configurable: true,
});
