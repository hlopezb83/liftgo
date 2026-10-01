import type { DamageRecordWithJoins } from "@/types/rental";

export function canUploadDamageEvidence(record: DamageRecordWithJoins, userId: string | undefined, role: string | null | undefined, canManage: boolean): boolean {
  if (!canManage || record.deleted_at || !role) return false;
  if (role !== "mechanic") return true;
  return record.reported_by === userId && !record.inspection_id && !record.booking_id
    && ["reported", "in_repair"].includes(record.status);
}
