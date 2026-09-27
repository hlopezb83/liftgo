interface MaintenanceState {
  work_status?: string | null;
  deleted_at?: string | null;
}

/** Las órdenes cerradas o archivadas conservan sus costos en modo consulta. */
export function canModifyMaintenance(log: MaintenanceState | null | undefined, canWrite: boolean): boolean {
  return Boolean(
    canWrite && log && !log.deleted_at &&
    log.work_status !== "completed" && log.work_status !== "cancelled",
  );
}
