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

export function maintenanceActionAccess(log: MaintenanceState, role: string | null | undefined, canWrite: boolean) {
  const isClosed = log.work_status === "completed" || log.work_status === "cancelled";
  const isAdmin = role === "admin";
  return {
    isClosed,
    readOnly: !canModifyMaintenance(log, canWrite),
    canArchive: isAdmin || role === "administrativo",
    canArchiveClosed: isAdmin || (log.work_status === "cancelled" && role === "administrativo"),
    canReopen: isClosed && isAdmin,
  };
}
