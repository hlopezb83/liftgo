import { lazy } from "react";

export const AuthPage = lazy(() => import("./pages/AuthPage"));
export { startRecoveryCapture } from "./recoveryCapture";
export { useRecoveryStatus } from "./hooks/useRecoveryStatus";
export { type AuthMode, getAuthSubmitLabel } from "./lib/authTypes";
