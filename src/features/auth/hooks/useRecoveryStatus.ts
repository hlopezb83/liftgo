import { useSyncExternalStore } from "react";
import { getRecoveryStatus, subscribeRecovery, type RecoveryStatus } from "../recoverySession";

/** Estado del flujo de recuperación, compartido entre AuthGuard y AuthPage. */
export function useRecoveryStatus(): RecoveryStatus {
  return useSyncExternalStore(subscribeRecovery, getRecoveryStatus, () => "idle" as RecoveryStatus);
}
