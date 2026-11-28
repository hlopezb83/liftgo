/**
 * Query key factories para la feature `damage`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { operationSummaryKeys } from "@/lib/query/operationSummaryKeys";

export const damageRecordKeys = operationSummaryKeys.damageRecords;
export const damagePhotoCountsKeys = createEntityKeys("damage_photo_counts");
