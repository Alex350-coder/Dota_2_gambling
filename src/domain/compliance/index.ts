export {
  assertValidLimitPeriod,
  applyLimitChange,
  effectiveLimitValue,
  selfExclusionRevocableAt,
  DEFAULT_LIMITS,
  LIMIT_RAISE_COOLING_OFF_MS,
  type LimitKind,
  type LimitPeriod,
  type RgLimitState,
  type LimitChangeResult,
  type SelfExclusionPeriod,
} from "./limits";
export { periodStart, type RollingLimitPeriod } from "./period";
export { assertAdminCanChangeStatus } from "./self-exclusion-guard";
export { sumSessionMinutes, type SessionSpan } from "./activity-window";
