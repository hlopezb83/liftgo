/**
 * Snapshot sincrónico de auth para uso fuera de componentes (callbacks de toast,
 * builders de error). Se actualiza vía `setAuthSnapshot` desde un puente React.
 * LiftGo es single-tenant hoy; `organization` queda `null` reservado para futuro.
 */
export interface AuthSnapshotUser {
  id: string;
  email: string | null;
}

export interface AuthSnapshotOrganization {
  id: string;
  name: string;
}

export interface AuthSnapshot {
  user: AuthSnapshotUser | null;
  organization: AuthSnapshotOrganization | null;
  role: string | null;
}

let snapshot: AuthSnapshot = { user: null, organization: null, role: null };

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

export function setAuthSnapshot(next: AuthSnapshot): void {
  snapshot = next;
}
