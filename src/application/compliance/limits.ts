import {
  applyLimitChange,
  assertValidLimitPeriod,
  DEFAULT_LIMITS,
  effectiveLimitValue,
  type LimitKind,
  type LimitPeriod,
  type RgLimitState,
} from "@/domain/compliance";
import type { Clock, RgLimitRepository, UnitOfWork } from "@/domain/ports";

export interface LimitView {
  readonly kind: LimitKind;
  readonly period: LimitPeriod;
  readonly currentValue: bigint;
  readonly pendingValue: bigint | null;
  readonly effectiveAt: Date | null;
  readonly effectiveValue: bigint;
}

export interface ListLimitsInput {
  readonly userId: string;
}

export interface ListLimitsDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly rgLimits: (tx: Tx, ownerId: string) => RgLimitRepository;
  readonly clock: Clock;
}

/**
 * Every account starts from `DEFAULT_LIMITS` (RESPONSIBLE_GAMBLING.md §2) until the user sets
 * their own row for a `(kind, period)` pair — this merges the two so the account always sees a
 * complete set, never an empty page for a brand-new user (T-812).
 */
export class ListLimitsUseCase<Tx> {
  constructor(private readonly deps: ListLimitsDeps<Tx>) {}

  async execute(input: ListLimitsInput): Promise<readonly LimitView[]> {
    const now = this.deps.clock.now();
    return this.deps.uow.run(async (tx) => {
      const rows = await this.deps.rgLimits(tx, input.userId).listAll();
      const byKey = new Map(rows.map((row) => [`${row.kind}:${row.period}`, row]));

      return DEFAULT_LIMITS.map((defaultLimit) => {
        const existing = byKey.get(`${defaultLimit.kind}:${defaultLimit.period}`);
        const state: RgLimitState = existing ?? {
          kind: defaultLimit.kind,
          period: defaultLimit.period,
          currentValue: defaultLimit.value,
          pendingValue: null,
          effectiveAt: null,
        };
        return { ...state, effectiveValue: effectiveLimitValue(state, now) };
      });
    });
  }
}

export interface UpdateLimitInput {
  readonly userId: string;
  readonly kind: LimitKind;
  readonly period: LimitPeriod;
  readonly value: bigint;
}

export interface UpdateLimitDeps<Tx> {
  readonly uow: UnitOfWork<Tx>;
  readonly rgLimits: (tx: Tx, ownerId: string) => RgLimitRepository;
  readonly clock: Clock;
}

/**
 * Lowering a limit applies immediately; raising it defers 24h (RULE-K07,
 * `applyLimitChange`) — the caller never sees the raise take effect on this same call.
 */
export class UpdateLimitUseCase<Tx> {
  constructor(private readonly deps: UpdateLimitDeps<Tx>) {}

  async execute(input: UpdateLimitInput): Promise<LimitView> {
    assertValidLimitPeriod(input.kind, input.period);
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx) => {
      const repo = this.deps.rgLimits(tx, input.userId);
      const existingRows = await repo.listByKind(input.kind);
      const existing = existingRows.find((row) => row.period === input.period);
      const defaultLimit = DEFAULT_LIMITS.find(
        (limit) => limit.kind === input.kind && limit.period === input.period,
      );
      const current: RgLimitState = existing ?? {
        kind: input.kind,
        period: input.period,
        currentValue: defaultLimit?.value ?? 0n,
        pendingValue: null,
        effectiveAt: null,
      };

      const changed = applyLimitChange(current, input.value, now);
      const next: RgLimitState = {
        kind: input.kind,
        period: input.period,
        currentValue: changed.currentValue,
        pendingValue: changed.pendingValue,
        effectiveAt: changed.effectiveAt,
      };
      await repo.upsert(next);

      return { ...next, effectiveValue: effectiveLimitValue(next, now) };
    });
  }
}
