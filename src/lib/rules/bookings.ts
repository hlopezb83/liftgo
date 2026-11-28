import type { AppRole } from "@/lib/domain/roles";

const DIRECT_BOOKING_CREATION_ROLES: readonly AppRole[] = ["admin"] as const;

export function canCreateDirectBooking(role: AppRole | string | null | undefined): boolean {
  return Boolean(role && (DIRECT_BOOKING_CREATION_ROLES as readonly string[]).includes(role));
}
