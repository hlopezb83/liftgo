import type { AppRole } from "@/features/users";

export interface ActivityRange {
  from: Date;
  to: Date;
}

export interface MemberStat {
  actorId: string | null;
  actorName: string;
  actorRole: AppRole | null;
  total: number;
  lastAt: string;
}

export interface ModuleStat {
  entityType: string;
  total: number;
}

export interface HourStat {
  hour: number;
  total: number;
}

export interface ActivityMetrics {
  totalCurrent: number;
  totalPrevious: number;
  uniqueActors: number;
  topModule: string | null;
  peakHour: number | null;
  byMember: MemberStat[];
  byModule: ModuleStat[];
  byHour: HourStat[];
}
