/**
 * Query key factories para la feature `feedback`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const feedbackReportKeys = createEntityKeys("feedback_reports");
export const feedbackHistoryKeys = createEntityKeys("feedback_history");
export const feedbackLeaderboardKeys = createEntityKeys("feedback_leaderboard");
export const feedbackScreenshotUrlKeys = createEntityKeys("feedback-screenshot-url");
