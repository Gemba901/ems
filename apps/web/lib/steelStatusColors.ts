/** @deprecated Import from @/lib/status for new code.
 * Compatibility bridge for existing Steel imports. No local colour/status map.
 * Retained until the module migration removes the legacy API (roadmap Phase 6).
 */
import {
  STATUS_TONE_CLASSES,
  STATUS_TONE_MAP,
  statusToTone,
  type StatusTone,
} from "./status";
export { statusBadgeClass } from "./status";

export type SemanticStatus =
  | "SUCCESS"
  | "WARNING"
  | "ERROR"
  | "INFO"
  | "NEUTRAL";
const legacyTone: Record<StatusTone, SemanticStatus> = {
  success: "SUCCESS",
  warning: "WARNING",
  info: "INFO",
  danger: "ERROR",
  neutral: "NEUTRAL",
};
export const SEMANTIC_BADGE_CLASSES: Readonly<Record<SemanticStatus, string>> =
  Object.freeze({
    SUCCESS: STATUS_TONE_CLASSES.success,
    WARNING: STATUS_TONE_CLASSES.warning,
    ERROR: STATUS_TONE_CLASSES.danger,
    INFO: STATUS_TONE_CLASSES.info,
    NEUTRAL: STATUS_TONE_CLASSES.neutral,
  });
export const STATUS_SEMANTIC_MAP: Readonly<Record<string, SemanticStatus>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(STATUS_TONE_MAP).map(([status, tone]) => [
        status,
        legacyTone[tone],
      ]),
    ),
  );
export function statusToSemantic(status: string): SemanticStatus {
  return legacyTone[statusToTone(status)];
}
